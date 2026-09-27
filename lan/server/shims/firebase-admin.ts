// Local implementation of the subset of `firebase-admin` used by functions/src.
// esbuild aliases `firebase-admin` to this file when bundling the LAN server.
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, FieldValue, Timestamp } from '../../../src/lan/shared/codec';
import {
  autoId, getField, splitPath, DOC_ID_FIELD,
  type DocEntry, type Json, type JsonObject, type QuerySpec, type WhereOp,
} from '../../../src/lan/shared/values';
import type { WriteOp } from '../../../src/lan/shared/protocol';
import { rt } from '../runtime';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------- Firestore

class FieldPath {
  constructor(readonly name: string) {}
  static documentId(): FieldPath {
    return new FieldPath(DOC_ID_FIELD);
  }
}

function fieldName(f: string | FieldPath): string {
  return typeof f === 'string' ? f : f.name;
}

class DocumentSnapshot {
  constructor(readonly ref: DocumentReference, private raw: JsonObject | null) {}
  get id() { return this.ref.id; }
  get exists() { return this.raw !== null; }
  data(): any {
    return this.raw === null ? undefined : decode(structuredClone(this.raw));
  }
  get(field: string | FieldPath): any {
    return this.raw === null ? undefined : decode(structuredClone(getField(this.raw, fieldName(field)) ?? null));
  }
}

class QuerySnapshot {
  constructor(readonly docs: DocumentSnapshot[]) {}
  get empty() { return this.docs.length === 0; }
  get size() { return this.docs.length; }
  forEach(cb: (d: DocumentSnapshot) => void) { this.docs.forEach(cb); }
}

function encodeData(data: Record<string, unknown>): JsonObject {
  return encode(data) as JsonObject;
}

function encodeUpdate(args: unknown[]): JsonObject {
  if (args.length === 1) return encodeData(args[0] as Record<string, unknown>);
  const out: JsonObject = {};
  for (let i = 0; i + 1 < args.length; i += 2) out[fieldName(args[i] as string)] = encode(args[i + 1]);
  return out;
}

export class DocumentReference {
  readonly type = 'document';
  constructor(readonly path: string) {}
  get id() { return this.path.slice(this.path.lastIndexOf('/') + 1); }
  get parent() { return new CollectionReference(this.path.slice(0, this.path.lastIndexOf('/'))); }
  collection(sub: string) { return new CollectionReference(`${this.path}/${sub}`); }
  async get() { return new DocumentSnapshot(this, rt().docs.getDoc(this.path)); }
  async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
    rt().docs.commit([{ op: 'set', path: this.path, data: encodeData(data), merge: !!opts?.merge }]);
    return { writeTime: Timestamp.now() };
  }
  async create(data: Record<string, unknown>) {
    if (rt().docs.getDoc(this.path)) throw Object.assign(new Error('Document already exists'), { code: 6 });
    return this.set(data);
  }
  async update(...args: unknown[]) {
    rt().docs.commit([{ op: 'update', path: this.path, data: encodeUpdate(args) }]);
    return { writeTime: Timestamp.now() };
  }
  async delete() {
    rt().docs.commit([{ op: 'delete', path: this.path }]);
    return { writeTime: Timestamp.now() };
  }
  async listCollections() {
    return rt().docs.listCollections(this.path).map((id) => this.collection(id));
  }
  isEqual(o: DocumentReference) { return o?.path === this.path; }
}

class Query {
  constructor(protected spec: QuerySpec) {}
  private with(patch: Partial<QuerySpec>): Query {
    return new Query({ ...this.spec, ...patch });
  }
  where(field: string | FieldPath, op: WhereOp, value: unknown): Query {
    const f = fieldName(field);
    const v = f === DOC_ID_FIELD && value instanceof DocumentReference ? value.id : encode(value);
    return this.with({ where: [...this.spec.where, [f, op, v]] });
  }
  orderBy(field: string | FieldPath, dir: 'asc' | 'desc' = 'asc'): Query {
    return this.with({ orderBy: [...this.spec.orderBy, [fieldName(field), dir]] });
  }
  limit(n: number): Query { return this.with({ limit: n }); }
  limitToLast(n: number): Query { return this.with({ limitToLast: n }); }
  offset(n: number): Query { return this.with({ offset: n } as Partial<QuerySpec>); }
  select(): Query { return this; }
  private cursor(args: unknown[]): Json[] {
    if (args.length === 1 && args[0] instanceof DocumentSnapshot) {
      const snap = args[0];
      return this.spec.orderBy.map(([f]) => (f === DOC_ID_FIELD ? snap.id : encode(snap.get(f))));
    }
    return args.map((a) => encode(a));
  }
  startAfter(...args: unknown[]): Query { return this.with({ startAfter: this.cursor(args) }); }
  startAt(...args: unknown[]): Query { return this.with({ startAt: this.cursor(args) }); }
  endBefore(...args: unknown[]): Query { return this.with({ endBefore: this.cursor(args) }); }
  endAt(...args: unknown[]): Query { return this.with({ endAt: this.cursor(args) }); }
  private run(): DocEntry[] {
    const offset = (this.spec as QuerySpec & { offset?: number }).offset ?? 0;
    if (!offset) return rt().docs.query(this.spec);
    const lim = this.spec.limit;
    const all = rt().docs.query({ ...this.spec, limit: lim === undefined ? undefined : lim + offset });
    return all.slice(offset);
  }
  async get() {
    return new QuerySnapshot(this.run().map((d) => new DocumentSnapshot(new DocumentReference(d.path), d.data)));
  }
  count() {
    return { get: async () => ({ data: () => ({ count: this.run().length }) }) };
  }
}

export class CollectionReference extends Query {
  constructor(readonly path: string) {
    super({ path, where: [], orderBy: [] });
  }
  get id() { return this.path.slice(this.path.lastIndexOf('/') + 1); }
  get parent() {
    const i = this.path.lastIndexOf('/');
    return i < 0 ? null : new DocumentReference(this.path.slice(0, i));
  }
  doc(id?: string) { return new DocumentReference(`${this.path}/${id ?? autoId()}`); }
  async add(data: Record<string, unknown>) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
  async listDocuments() {
    return rt().docs.query({ path: this.path, where: [], orderBy: [] }).map((d) => new DocumentReference(d.path));
  }
}

class WriteBatch {
  private ops: WriteOp[] = [];
  set(ref: DocumentReference, data: Record<string, unknown>, opts?: { merge?: boolean }) {
    this.ops.push({ op: 'set', path: ref.path, data: encodeData(data), merge: !!opts?.merge });
    return this;
  }
  create(ref: DocumentReference, data: Record<string, unknown>) { return this.set(ref, data); }
  update(ref: DocumentReference, ...args: unknown[]) {
    this.ops.push({ op: 'update', path: ref.path, data: encodeUpdate(args) });
    return this;
  }
  delete(ref: DocumentReference) {
    this.ops.push({ op: 'delete', path: ref.path });
    return this;
  }
  async commit() {
    rt().docs.commit(this.ops);
    this.ops = [];
    return [];
  }
}

/** Reads are live; writes are buffered and applied atomically at the end (single-threaded, so no conflicts). */
class Transaction {
  private batch = new WriteBatch();
  async get(target: DocumentReference | Query): Promise<any> {
    return target.get();
  }
  async getAll(...refs: DocumentReference[]) {
    return Promise.all(refs.map((r) => r.get()));
  }
  set(ref: DocumentReference, data: Record<string, unknown>, opts?: { merge?: boolean }) { this.batch.set(ref, data, opts); return this; }
  create(ref: DocumentReference, data: Record<string, unknown>) { this.batch.create(ref, data); return this; }
  update(ref: DocumentReference, ...args: unknown[]) { this.batch.update(ref, ...args); return this; }
  delete(ref: DocumentReference) { this.batch.delete(ref); return this; }
  async _commit() { await this.batch.commit(); }
}

class Firestore {
  doc(p: string) { return new DocumentReference(splitPath(p).join('/')); }
  collection(p: string) { return new CollectionReference(splitPath(p).join('/')); }
  collectionGroup(id: string) { return new Query({ path: id, group: true, where: [], orderBy: [] }); }
  batch() { return new WriteBatch(); }
  bulkWriter() {
    const b = new WriteBatch();
    return { set: b.set.bind(b), update: b.update.bind(b), delete: b.delete.bind(b), close: () => b.commit(), flush: () => b.commit() };
  }
  async getAll(...refs: DocumentReference[]) { return Promise.all(refs.map((r) => r.get())); }
  async runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx = new Transaction();
    const result = await fn(tx);
    await tx._commit();
    return result;
  }
  async recursiveDelete(ref: DocumentReference | CollectionReference) {
    const del = async (d: DocumentReference): Promise<void> => {
      for (const c of await d.listCollections()) for (const child of await c.listDocuments()) await del(child);
      await d.delete();
    };
    if (ref instanceof DocumentReference) await del(ref);
    else for (const d of await ref.listDocuments()) await del(d);
  }
  settings() {}
}

const firestoreInstance = new Firestore();

export const firestore = Object.assign(() => firestoreInstance, {
  FieldValue,
  Timestamp,
  FieldPath,
  Firestore,
  DocumentReference,
  CollectionReference,
});

// ---------------------------------------------------------------- Realtime Database

class DataSnapshot {
  constructor(readonly ref: Reference, private value: Json) {}
  get key() { return this.ref.key; }
  val(): any { return this.value; }
  exportVal(): any { return this.value; }
  toJSON(): any { return this.value; }
  exists() { return this.value !== null && this.value !== undefined; }
  child(p: string) {
    let cur: Json = this.value;
    for (const k of splitPath(p)) cur = cur && typeof cur === 'object' && !Array.isArray(cur) ? ((cur as JsonObject)[k] ?? null) : null;
    return new DataSnapshot(this.ref.child(p), cur);
  }
  hasChild(p: string) { return this.child(p).exists(); }
  hasChildren() { return this.numChildren() > 0; }
  numChildren() { return this.value && typeof this.value === 'object' ? Object.keys(this.value).length : 0; }
  get size() { return this.numChildren(); }
  forEach(cb: (s: DataSnapshot) => boolean | void) {
    if (!this.value || typeof this.value !== 'object') return false;
    for (const k of Object.keys(this.value)) if (cb(this.child(k)) === true) return true;
    return false;
  }
}

export class Reference {
  constructor(readonly path: string) {}
  get key() { const p = splitPath(this.path); return p.length ? p[p.length - 1] : null; }
  get ref() { return this; }
  get parent(): Reference | null { const p = splitPath(this.path); return p.length ? new Reference(p.slice(0, -1).join('/')) : null; }
  get root() { return new Reference(''); }
  child(p: string) { return new Reference([...splitPath(this.path), ...splitPath(p)].join('/')); }
  async get() { return new DataSnapshot(this, rt().tree.get(this.path)); }
  async once(_event = 'value') { return this.get(); }
  async set(v: unknown) { rt().tree.set(this.path, v); }
  async update(v: Record<string, unknown>) { rt().tree.update(this.path, v); }
  async remove() { rt().tree.remove(this.path); }
  push(v?: unknown) {
    const ref = this.child(pushId());
    const p: Promise<Reference> = v === undefined ? Promise.resolve(ref) : ref.set(v).then(() => ref);
    return Object.assign(p, { key: ref.key, path: ref.path, ref });
  }
  async transaction(fn: (cur: any) => any) {
    const r = rt().tree.transaction(this.path, fn);
    return { committed: r.committed, snapshot: new DataSnapshot(this, r.value) };
  }
  toString() { return `/${this.path}`; }
}

const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
function pushId(): string {
  let now = Date.now();
  let s = '';
  for (let i = 0; i < 8; i++) { s = PUSH_CHARS[now % 64] + s; now = Math.floor(now / 64); }
  for (let i = 0; i < 12; i++) s += PUSH_CHARS[Math.floor(Math.random() * 64)];
  return s;
}

export const database = Object.assign(() => ({ ref: (p = '') => new Reference(splitPath(p).join('/')) }), {
  ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } },
});

// ---------------------------------------------------------------- Storage

function uploadPath(p: string): string {
  const full = path.resolve(rt().uploadsDir, ...splitPath(p));
  if (!full.startsWith(path.resolve(rt().uploadsDir))) throw new Error('Invalid storage path');
  return full;
}

class StorageFile {
  constructor(readonly name: string) {}
  async save(data: Buffer | string) {
    const f = uploadPath(this.name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, data);
  }
  async exists(): Promise<[boolean]> { return [fs.existsSync(uploadPath(this.name))]; }
  async delete() { fs.rmSync(uploadPath(this.name), { force: true }); }
  async download(): Promise<[Buffer]> { return [fs.readFileSync(uploadPath(this.name))]; }
  async getMetadata(): Promise<[{ size: number; name: string }]> {
    return [{ size: fs.statSync(uploadPath(this.name)).size, name: this.name }];
  }
  async makePublic() {}
  publicUrl() { return `/uploads/${this.name.split('/').map(encodeURIComponent).join('/')}`; }
  async getSignedUrl(): Promise<[string]> { return [this.publicUrl()]; }
}

export const storage = () => ({ bucket: () => ({ file: (name: string) => new StorageFile(name) }) });

// ---------------------------------------------------------------- misc

export function messaging() {
  // Push notifications need Google's servers; on a LAN they are silently skipped.
  return {
    sendEachForMulticast: async (m: { tokens: string[] }) => ({ successCount: 0, failureCount: m.tokens.length, responses: [] }),
    send: async (_m?: unknown) => '',
  };
}
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace messaging {
  type MulticastMessage = { tokens: string[]; notification?: unknown; data?: Record<string, string>; [k: string]: unknown };
}

export const auth = () => ({
  getUser: async (uid: string) => {
    const u = rt().auth.getUser(uid);
    if (!u) throw Object.assign(new Error('User not found'), { code: 'auth/user-not-found' });
    return u;
  },
  getUserByEmail: async (email: string) => {
    const u = rt().auth.findByEmail(email);
    if (!u) throw Object.assign(new Error('User not found'), { code: 'auth/user-not-found' });
    return u;
  },
  setCustomUserClaims: async () => {},
});

export const apps: unknown[] = [];
export function initializeApp() {
  return {};
}
