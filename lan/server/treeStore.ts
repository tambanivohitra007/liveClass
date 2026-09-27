import { isPlainObject, splitPath, type Json, type JsonObject } from '../../src/lan/shared/values';
import type { Persistence } from './persistence';

type Listener = { parts: string[]; fire: () => void };
type CreateTrigger = { parts: string[]; cb: (params: Record<string, string>, value: Json) => void };

const KV_KEY = 'rtdb';

/** Resolves `{".sv":"timestamp"}` and drops empty objects/nulls the way the Realtime Database does. */
export function normalize(value: unknown, now: number): Json {
  if (value === undefined || value === null) return null;
  if (isPlainObject(value)) {
    if (value['.sv'] === 'timestamp') return now;
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(value)) {
      const n = normalize(v, now);
      if (n !== null) out[k] = n;
    }
    return Object.keys(out).length ? out : null;
  }
  if (Array.isArray(value)) {
    const out: JsonObject = {};
    value.forEach((v, i) => {
      const n = normalize(v, now);
      if (n !== null) out[String(i)] = n;
    });
    return Object.keys(out).length ? out : null;
  }
  return value as Json;
}

function isPrefix(a: string[], b: string[]): boolean {
  if (a.length > b.length) return false;
  return a.every((p, i) => p === b[i]);
}

function matchPattern(pattern: string[], parts: string[]): Record<string, string> | null {
  if (pattern.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p.startsWith('{') && p.endsWith('}')) params[p.slice(1, -1)] = parts[i];
    else if (p !== parts[i]) return null;
  }
  return params;
}

/** Realtime-Database-compatible JSON tree with path listeners and onValueCreated triggers. */
export class TreeStore {
  private root: JsonObject = {};
  private listeners = new Set<Listener>();
  private dirty = new Set<Listener>();
  private flushScheduled = false;
  private triggers: CreateTrigger[] = [];
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private persistence: Persistence | null) {
    const saved = persistence?.loadKv(KV_KEY);
    if (saved) this.root = JSON.parse(saved) as JsonObject;
  }

  get(path: string): Json {
    let cur: Json = this.root;
    for (const p of splitPath(path)) {
      if (!isPlainObject(cur)) return null;
      cur = (cur as JsonObject)[p] ?? null;
    }
    return cur === undefined ? null : structuredClone(cur);
  }

  private exists(parts: string[]): boolean {
    let cur: Json = this.root;
    for (const p of parts) {
      if (!isPlainObject(cur)) return false;
      cur = (cur as JsonObject)[p];
      if (cur === undefined || cur === null) return false;
    }
    return true;
  }

  private writeRaw(parts: string[], value: Json): void {
    if (parts.length === 0) {
      this.root = isPlainObject(value) ? (value as JsonObject) : {};
      return;
    }
    const chain: JsonObject[] = [this.root];
    let cur = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      let next = cur[parts[i]];
      if (!isPlainObject(next)) {
        if (value === null) return;
        next = cur[parts[i]] = {};
      }
      cur = next as JsonObject;
      chain.push(cur);
    }
    const last = parts[parts.length - 1];
    if (value === null) delete cur[last];
    else cur[last] = value;
    // prune empty parents
    for (let i = chain.length - 1; i > 0; i--) {
      if (Object.keys(chain[i]).length === 0) delete chain[i - 1][parts[i - 1]];
      else break;
    }
  }

  /** Every multi-location write goes through here so triggers and listeners see one consistent change. */
  private apply(writes: { parts: string[]; value: Json }[]): void {
    // Snapshot trigger candidates before writing.
    const pending: { trig: CreateTrigger; parts: string[]; params: Record<string, string> }[] = [];
    const seen = new Set<string>();
    for (const trig of this.triggers) {
      const d = trig.parts.length;
      for (const w of writes) {
        const candidates: string[][] = [];
        if (w.parts.length >= d) candidates.push(w.parts.slice(0, d));
        else if (isPlainObject(w.value)) {
          // enumerate descendants at trigger depth inside the written value
          const walk = (node: Json, acc: string[]) => {
            if (acc.length === d) return void candidates.push(acc);
            if (!isPlainObject(node)) return;
            for (const k of Object.keys(node as JsonObject)) walk((node as JsonObject)[k], [...acc, k]);
          };
          walk(w.value, w.parts);
        }
        for (const c of candidates) {
          const key = trig.parts.join('/') + '|' + c.join('/');
          if (seen.has(key)) continue;
          const params = matchPattern(trig.parts, c);
          if (!params || this.exists(c)) continue;
          seen.add(key);
          pending.push({ trig, parts: c, params });
        }
      }
    }

    for (const w of writes) this.writeRaw(w.parts, w.value);
    if (this.persistence && !this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.persistence!.saveKv(KV_KEY, JSON.stringify(this.root));
      }, 2000);
    }

    for (const l of this.listeners) {
      if (writes.some((w) => isPrefix(l.parts, w.parts) || isPrefix(w.parts, l.parts))) this.dirty.add(l);
    }
    this.scheduleFlush();

    for (const p of pending) {
      if (!this.exists(p.parts)) continue;
      const value = this.get(p.parts.join('/'));
      queueMicrotask(() => {
        try {
          p.trig.cb(p.params, value);
        } catch (err) {
          console.error('[treeStore] trigger failed', err);
        }
      });
    }
  }

  set(path: string, value: unknown): void {
    this.apply([{ parts: splitPath(path), value: normalize(value, Date.now()) }]);
  }

  /** Multi-path update: keys may contain '/'. */
  update(path: string, values: Record<string, unknown>): void {
    const base = splitPath(path);
    const now = Date.now();
    this.apply(Object.entries(values).map(([k, v]) => ({ parts: [...base, ...splitPath(k)], value: normalize(v, now) })));
  }

  remove(path: string): void {
    this.set(path, null);
  }

  /** Synchronous read-modify-write; the JS event loop makes it atomic. */
  transaction(path: string, fn: (current: Json) => unknown): { committed: boolean; value: Json } {
    const current = this.get(path);
    const next = fn(current);
    if (next === undefined) return { committed: false, value: current };
    this.set(path, next);
    return { committed: true, value: this.get(path) };
  }

  watch(path: string, cb: (value: Json) => void): () => void {
    let last: string | undefined;
    const fire = () => {
      const v = this.get(path);
      const s = JSON.stringify(v);
      if (s === last) return;
      last = s;
      cb(v);
    };
    const l: Listener = { parts: splitPath(path), fire };
    this.listeners.add(l);
    fire();
    return () => this.listeners.delete(l);
  }

  saveNow(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.persistence?.saveKv(KV_KEY, JSON.stringify(this.root));
  }

  onValueCreated(pattern: string, cb: (params: Record<string, string>, value: Json) => void): void {
    this.triggers.push({ parts: splitPath(pattern), cb });
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.dirty.size === 0) return;
    this.flushScheduled = true;
    // Small delay lets bursts of answers collapse into one push per listener.
    setTimeout(() => {
      this.flushScheduled = false;
      const batch = [...this.dirty];
      this.dirty.clear();
      for (const l of batch) if (this.listeners.has(l)) l.fire();
    }, 30);
  }
}
