// Drop-in replacement for the parts of `firebase/database` LiveClass uses.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { lan, LanError } from './connection';
import { splitPath, type Json, type JsonObject } from './shared/values';

export class Database {
  readonly type = 'database';
}
const database = new Database();
export function getDatabase(_app?: unknown): Database {
  return database;
}

export class DatabaseReference {
  readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  get key(): string | null {
    const p = splitPath(this.path);
    return p.length ? p[p.length - 1] : null;
  }
  get parent(): DatabaseReference | null {
    const p = splitPath(this.path);
    return p.length ? new DatabaseReference(p.slice(0, -1).join('/')) : null;
  }
  get root(): DatabaseReference {
    return new DatabaseReference('');
  }
  toString(): string {
    return `/${this.path}`;
  }
}
export type Query = DatabaseReference;

export function ref(_db: Database, path = ''): DatabaseReference {
  return new DatabaseReference(splitPath(path).join('/'));
}
export function child(parent: DatabaseReference, path: string): DatabaseReference {
  return new DatabaseReference([...splitPath(parent.path), ...splitPath(path)].join('/'));
}

export class DataSnapshot {
  readonly ref: DatabaseReference;
  private value: Json;
  constructor(ref: DatabaseReference, value: Json) {
    this.ref = ref;
    this.value = value;
  }
  get key(): string | null {
    return this.ref.key;
  }
  val(): any {
    return this.value;
  }
  exportVal(): any {
    return this.value;
  }
  toJSON(): any {
    return this.value;
  }
  exists(): boolean {
    return this.value !== null && this.value !== undefined;
  }
  child(path: string): DataSnapshot {
    let cur: Json = this.value;
    for (const k of splitPath(path)) {
      cur = cur && typeof cur === 'object' && !Array.isArray(cur) ? ((cur as JsonObject)[k] ?? null) : null;
    }
    return new DataSnapshot(child(this.ref, path), cur);
  }
  hasChild(path: string): boolean {
    return this.child(path).exists();
  }
  hasChildren(): boolean {
    return this.size > 0;
  }
  get size(): number {
    return this.value && typeof this.value === 'object' ? Object.keys(this.value).length : 0;
  }
  forEach(cb: (s: DataSnapshot) => boolean | void): boolean {
    if (!this.value || typeof this.value !== 'object') return false;
    for (const k of Object.keys(this.value)) if (cb(this.child(k)) === true) return true;
    return false;
  }
}

export async function get(r: DatabaseReference): Promise<DataSnapshot> {
  const value = await lan().request<Json>({ t: 'rget', path: r.path });
  return new DataSnapshot(r, value);
}

export async function set(r: DatabaseReference, value: unknown): Promise<void> {
  await lan().request({ t: 'rset', path: r.path, value: (value ?? null) as Json });
}

export async function update(r: DatabaseReference, values: Record<string, unknown>): Promise<void> {
  await lan().request({ t: 'rupdate', path: r.path, value: values as JsonObject });
}

export async function remove(r: DatabaseReference): Promise<void> {
  await set(r, null);
}

const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
export function push(parent: DatabaseReference, value?: unknown): DatabaseReference & Promise<DatabaseReference> {
  let now = Date.now();
  let id = '';
  for (let i = 0; i < 8; i++) {
    id = PUSH_CHARS[now % 64] + id;
    now = Math.floor(now / 64);
  }
  for (let i = 0; i < 12; i++) id += PUSH_CHARS[Math.floor(Math.random() * 64)];
  const r = child(parent, id);
  const p = (value === undefined ? Promise.resolve(r) : set(r, value).then(() => r)) as Promise<DatabaseReference>;
  return Object.assign(p, { path: r.path, key: r.key, parent: r.parent, root: r.root, toString: () => r.toString() }) as any;
}

export function serverTimestamp(): object {
  return { '.sv': 'timestamp' };
}

type Callback = (s: DataSnapshot) => void;
const registry = new Map<string, { cb: Callback; unsub: () => void }[]>();

export function onValue(r: DatabaseReference, cb: Callback, errOrOpts?: unknown, _opts?: unknown): () => void {
  const onError = typeof errOrOpts === 'function' ? (errOrOpts as (e: LanError) => void) : undefined;
  let active = true;
  const unsubRaw = lan().subscribe({ t: 'rsub', sid: '', path: r.path }, (m) => {
    if (!active) return;
    if (m.t === 'rsnap') cb(new DataSnapshot(r, m.value));
    else if (m.t === 'subError') onError?.(new LanError(m.error.code, m.error.message));
  });
  const entry = {
    cb,
    unsub: () => {
      active = false;
      unsubRaw();
    },
  };
  const list = registry.get(r.path) ?? [];
  list.push(entry);
  registry.set(r.path, list);
  return () => {
    entry.unsub();
    const l = registry.get(r.path);
    if (l) registry.set(r.path, l.filter((e) => e !== entry));
  };
}

/** Legacy-style listener removal: `off(ref)` or `off(ref, 'value', callback)`. */
export function off(r: DatabaseReference, _event?: string, cb?: Callback): void {
  const list = registry.get(r.path) ?? [];
  const keep = [];
  for (const e of list) {
    if (!cb || e.cb === cb) e.unsub();
    else keep.push(e);
  }
  registry.set(r.path, keep);
}

export function onDisconnect(_r: DatabaseReference) {
  return { set: async () => {}, remove: async () => {}, update: async () => {}, cancel: async () => {} };
}

export async function runTransaction(r: DatabaseReference, fn: (cur: any) => any): Promise<{ committed: boolean; snapshot: DataSnapshot }> {
  // Not atomic across clients; server-side code uses the admin shim's real transaction instead.
  const cur = (await get(r)).val();
  const next = fn(cur);
  if (next === undefined) return { committed: false, snapshot: new DataSnapshot(r, cur) };
  await set(r, next);
  return { committed: true, snapshot: new DataSnapshot(r, next) };
}

export function connectDatabaseEmulator(): void {}
