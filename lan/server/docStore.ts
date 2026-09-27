import { EventEmitter } from 'node:events';
import {
  applySet, applyUpdate, runQuery, splitPath,
  type DocEntry, type JsonObject, type QuerySpec,
} from '../../src/lan/shared/values';
import type { WriteOp } from '../../src/lan/shared/protocol';
import type { Persistence } from './persistence';

export interface DocChange {
  path: string;
  before: JsonObject | null;
  after: JsonObject | null;
}

type Listener = { key: string; affects: (path: string) => boolean; fire: () => void };

export class StoreError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function parentOf(docPath: string): string {
  return docPath.slice(0, docPath.lastIndexOf('/'));
}

function assertDocPath(p: string): void {
  const parts = splitPath(p);
  if (parts.length === 0 || parts.length % 2 !== 0) throw new StoreError('invalid-argument', `Invalid document path "${p}"`);
}

/**
 * In-memory, Firestore-compatible document database with realtime listeners.
 * Listener notifications are coalesced per tick, so a burst of writes (100 players
 * answering at once) produces one snapshot per listener instead of one per write.
 */
export class DocStore extends EventEmitter {
  private colls = new Map<string, Map<string, JsonObject>>();
  private watchers = new Set<Listener>();
  private dirty = new Set<Listener>();
  private flushScheduled = false;

  constructor(private persistence: Persistence | null) {
    super();
    this.setMaxListeners(0);
    if (persistence) {
      for (const row of persistence.loadDocs()) {
        this.put(row.path, JSON.parse(row.data) as JsonObject);
      }
    }
  }

  private put(docPath: string, data: JsonObject | null): void {
    const coll = parentOf(docPath);
    const id = docPath.slice(coll.length + 1);
    let m = this.colls.get(coll);
    if (data === null) {
      m?.delete(id);
      if (m && m.size === 0) this.colls.delete(coll);
      return;
    }
    if (!m) this.colls.set(coll, (m = new Map()));
    m.set(id, data);
  }

  getDoc(docPath: string): JsonObject | null {
    assertDocPath(docPath);
    const coll = parentOf(docPath);
    return this.colls.get(coll)?.get(docPath.slice(coll.length + 1)) ?? null;
  }

  private *candidates(q: QuerySpec): Iterable<DocEntry> {
    if (q.group) {
      for (const [coll, m] of this.colls) {
        if (coll.slice(coll.lastIndexOf('/') + 1) !== q.path) continue;
        for (const [id, data] of m) yield { id, path: `${coll}/${id}`, data };
      }
      return;
    }
    const m = this.colls.get(q.path);
    if (!m) return;
    for (const [id, data] of m) yield { id, path: `${q.path}/${id}`, data };
  }

  query(q: QuerySpec): DocEntry[] {
    return runQuery(this.candidates(q), q);
  }

  /** Document ids of every direct subcollection under a document (used for recursive deletes). */
  listCollections(docPath: string): string[] {
    const prefix = docPath + '/';
    const out = new Set<string>();
    for (const coll of this.colls.keys()) {
      if (coll.startsWith(prefix) && !coll.slice(prefix.length).includes('/')) out.add(coll.slice(prefix.length));
    }
    return [...out];
  }

  /** Computes the effect of a batch without applying it (used for permission checks). */
  preview(ops: WriteOp[]): DocChange[] {
    const now = Date.now();
    const staged = new Map<string, JsonObject | null>();
    const read = (p: string) => (staged.has(p) ? staged.get(p)! : this.getDoc(p));
    for (const op of ops) {
      assertDocPath(op.path);
      const existing = read(op.path);
      if (op.op === 'set') staged.set(op.path, applySet(existing, op.data, !!op.merge, now));
      else if (op.op === 'update') {
        if (!existing) throw new StoreError('not-found', `No document to update: ${op.path}`);
        staged.set(op.path, applyUpdate(existing, op.data, now));
      } else staged.set(op.path, null);
    }
    return [...staged].map(([path, after]) => ({ path, before: this.getDoc(path), after }));
  }

  /** Applies a batch atomically: every op is validated before anything is written. */
  commit(ops: WriteOp[]): DocChange[] {
    return this.apply(this.preview(ops));
  }

  apply(staged: DocChange[]): DocChange[] {
    const changes: DocChange[] = [];
    for (const { path: p, after } of staged) {
      const before = this.getDoc(p);
      if (before === null && after === null) continue;
      this.put(p, after);
      this.persistence?.saveDoc(p, after === null ? null : JSON.stringify(after));
      changes.push({ path: p, before, after });
    }
    for (const c of changes) {
      for (const l of this.watchers) if (l.affects(c.path)) this.dirty.add(l);
    }
    this.scheduleFlush();
    for (const c of changes) this.emit('change', c);
    return changes;
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.dirty.size === 0) return;
    this.flushScheduled = true;
    setImmediate(() => {
      this.flushScheduled = false;
      const batch = [...this.dirty];
      this.dirty.clear();
      for (const l of batch) {
        if (!this.watchers.has(l)) continue;
        try {
          l.fire();
        } catch (err) {
          console.error('[docStore] listener failed', err);
        }
      }
    });
  }

  watchDoc(docPath: string, cb: (data: JsonObject | null) => void): () => void {
    assertDocPath(docPath);
    let last: string | undefined;
    const fire = () => {
      const data = this.getDoc(docPath);
      const s = JSON.stringify(data);
      if (s === last) return;
      last = s;
      cb(data);
    };
    const l: Listener = { key: docPath, affects: (p) => p === docPath, fire };
    this.watchers.add(l);
    fire();
    return () => this.watchers.delete(l);
  }

  watchQuery(q: QuerySpec, cb: (docs: DocEntry[]) => void): () => void {
    let last: string | undefined;
    const fire = () => {
      const docs = this.query(q);
      const s = JSON.stringify(docs);
      if (s === last) return;
      last = s;
      cb(docs);
    };
    const affects = q.group
      ? (p: string) => {
          const coll = parentOf(p);
          return coll.slice(coll.lastIndexOf('/') + 1) === q.path;
        }
      : (p: string) => parentOf(p) === q.path;
    const l: Listener = { key: q.path, affects, fire };
    this.watchers.add(l);
    fire();
    return () => this.watchers.delete(l);
  }
}
