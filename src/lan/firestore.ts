// Drop-in replacement for the parts of `firebase/firestore` LiveClass uses, backed by the LAN server.
// Vite aliases `firebase/firestore` to this module.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { lan, LanError } from './connection';
import { decode, encode, FieldValue, Timestamp } from './shared/codec';
import { autoId, getField, splitPath, DOC_ID_FIELD, type DocEntry, type Json, type JsonObject, type QuerySpec, type WhereOp } from './shared/values';
import type { ServerMessage, WriteOp } from './shared/protocol';

export { Timestamp, FieldValue };
export type DocumentData = { [field: string]: any };
export type WhereFilterOp = WhereOp;
export type OrderByDirection = 'asc' | 'desc';
export type Unsubscribe = () => void;
export type FirestoreError = LanError;
export type SetOptions = { merge?: boolean; mergeFields?: string[] };
export type UpdateData<T> = Partial<T> & { [path: string]: any };
export type WithFieldValue<T> = T;
export type PartialWithFieldValue<T> = Partial<T>;

export class Firestore {
  readonly type = 'firestore';
}
const db = new Firestore();
export function getFirestore(_app?: unknown): Firestore {
  return db;
}
export const initializeFirestore = getFirestore;

export class FieldPath {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
}
export function documentId(): FieldPath {
  return new FieldPath(DOC_ID_FIELD);
}
const fname = (f: string | FieldPath) => (typeof f === 'string' ? f : f.name);

// ---------------------------------------------------------------- references

export class DocumentReference<T = DocumentData> {
  readonly type = 'document';
  readonly firestore = db;
  readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  get id(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }
  get parent(): CollectionReference<T> {
    return new CollectionReference<T>(this.path.slice(0, this.path.lastIndexOf('/')));
  }
  withConverter(): DocumentReference<T> {
    return this;
  }
  toJSON() {
    return { path: this.path };
  }
  /** Phantom marker so `T` participates in type inference. */
  declare readonly __t?: T;
}

export class Query<T = DocumentData> {
  readonly type: string = 'query';
  readonly firestore = db;
  readonly _spec: QuerySpec;
  constructor(_spec: QuerySpec) {
    this._spec = _spec;
  }
  withConverter(): Query<T> {
    return this;
  }
  declare readonly __t?: T;
}

export class CollectionReference<T = DocumentData> extends Query<T> {
  override readonly type = 'collection';
  readonly path: string;
  constructor(path: string) {
    super({ path, where: [], orderBy: [] });
    this.path = path;
  }
  get id(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }
  get parent(): DocumentReference | null {
    const i = this.path.lastIndexOf('/');
    return i < 0 ? null : new DocumentReference(this.path.slice(0, i));
  }
  override withConverter(): CollectionReference<T> {
    return this;
  }
}

type Parent = Firestore | DocumentReference<any> | CollectionReference<any>;

function basePath(parent: Parent): string {
  return parent instanceof Firestore ? '' : parent.path;
}

export function collection(parent: Parent, path: string, ...segments: string[]): CollectionReference<DocumentData> {
  const parts = [...splitPath(basePath(parent)), ...splitPath(path), ...segments.flatMap(splitPath)];
  if (parts.length % 2 !== 1) throw new LanError('invalid-argument', `Invalid collection path "${parts.join('/')}"`);
  return new CollectionReference(parts.join('/'));
}

export function doc(parent: Parent, path?: string, ...segments: string[]): DocumentReference<DocumentData> {
  const extra = path === undefined ? [autoId()] : [...splitPath(path), ...segments.flatMap(splitPath)];
  const parts = [...splitPath(basePath(parent)), ...extra];
  if (parts.length % 2 !== 0) throw new LanError('invalid-argument', `Invalid document path "${parts.join('/')}"`);
  return new DocumentReference(parts.join('/'));
}

export function collectionGroup(_db: Firestore, id: string): Query<DocumentData> {
  return new Query({ path: id, group: true, where: [], orderBy: [] });
}

// ---------------------------------------------------------------- query constraints

export class QueryConstraint {
  readonly type: string;
  readonly apply: (s: QuerySpec) => QuerySpec;
  constructor(type: string, apply: (s: QuerySpec) => QuerySpec) {
    this.type = type;
    this.apply = apply;
  }
}
export type QueryFieldFilterConstraint = QueryConstraint;
export type QueryOrderByConstraint = QueryConstraint;
export type QueryLimitConstraint = QueryConstraint;
export type QueryStartAtConstraint = QueryConstraint;

export function where(field: string | FieldPath, op: WhereFilterOp, value: unknown): QueryConstraint {
  const f = fname(field);
  const v = f === DOC_ID_FIELD
    ? (Array.isArray(value) ? value.map((x) => (x instanceof DocumentReference ? x.id : x)) : value instanceof DocumentReference ? value.id : value)
    : value;
  return new QueryConstraint('where', (s) => ({ ...s, where: [...s.where, [f, op, encode(v)]] }));
}
export function orderBy(field: string | FieldPath, dir: OrderByDirection = 'asc'): QueryConstraint {
  return new QueryConstraint('orderBy', (s) => ({ ...s, orderBy: [...s.orderBy, [fname(field), dir]] }));
}
export function limit(n: number): QueryConstraint {
  return new QueryConstraint('limit', (s) => ({ ...s, limit: n }));
}
export function limitToLast(n: number): QueryConstraint {
  return new QueryConstraint('limitToLast', (s) => ({ ...s, limitToLast: n }));
}
function cursor(kind: 'startAfter' | 'startAt' | 'endBefore' | 'endAt', args: unknown[]): QueryConstraint {
  return new QueryConstraint(kind, (s) => {
    let values: Json[];
    if (args.length === 1 && args[0] instanceof DocumentSnapshot) {
      const snap = args[0];
      values = s.orderBy.map(([f]) => (f === DOC_ID_FIELD ? snap.id : encode(snap.get(f))));
      if (!s.orderBy.some(([f]) => f === DOC_ID_FIELD)) {
        // Tie-break on id like Firestore does.
        s = { ...s, orderBy: [...s.orderBy, [DOC_ID_FIELD, s.orderBy[s.orderBy.length - 1]?.[1] ?? 'asc']] };
        values.push(snap.id);
      }
    } else values = args.map((a) => encode(a));
    return { ...s, [kind]: values };
  });
}
export const startAfter = (...a: unknown[]) => cursor('startAfter', a);
export const startAt = (...a: unknown[]) => cursor('startAt', a);
export const endBefore = (...a: unknown[]) => cursor('endBefore', a);
export const endAt = (...a: unknown[]) => cursor('endAt', a);

export function query<T>(base: Query<T>, ...constraints: (QueryConstraint | null | undefined)[]): Query<T> {
  let spec = base._spec;
  for (const c of constraints) if (c) spec = c.apply(spec);
  return new Query<T>(spec);
}

// ---------------------------------------------------------------- snapshots

const METADATA = Object.freeze({ hasPendingWrites: false, fromCache: false, isEqual: () => true });

export class DocumentSnapshot<T = DocumentData> {
  readonly metadata = METADATA;
  readonly ref: DocumentReference<T>;
  private raw: JsonObject | null;
  constructor(ref: DocumentReference<T>, raw: JsonObject | null) {
    this.ref = ref;
    this.raw = raw;
  }
  get id(): string {
    return this.ref.id;
  }
  exists(): this is QueryDocumentSnapshot<T> {
    return this.raw !== null;
  }
  data(_opts?: unknown): T | undefined {
    return this.raw === null ? undefined : (decode(this.raw) as T);
  }
  get(field: string | FieldPath): any {
    if (this.raw === null) return undefined;
    const f = fname(field);
    return f === DOC_ID_FIELD ? this.id : decode(getField(this.raw, f) ?? undefined);
  }
}

export class QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
  override data(_opts?: unknown): T {
    return super.data() as T;
  }
}

export interface DocumentChange<T = DocumentData> {
  type: 'added' | 'modified' | 'removed';
  doc: QueryDocumentSnapshot<T>;
  oldIndex: number;
  newIndex: number;
}

export class QuerySnapshot<T = DocumentData> {
  readonly metadata = METADATA;
  readonly docs: QueryDocumentSnapshot<T>[];
  readonly query: Query<T>;
  private prev: DocEntry[] | null;
  private entries_: DocEntry[];
  constructor(query: Query<T>, entries: DocEntry[], prev: DocEntry[] | null = null) {
    this.query = query;
    this.prev = prev;
    this.entries_ = entries;
    this.docs = entries.map((e) => new QueryDocumentSnapshot<T>(new DocumentReference<T>(e.path), e.data));
  }
  get empty(): boolean {
    return this.docs.length === 0;
  }
  get size(): number {
    return this.docs.length;
  }
  forEach(cb: (d: QueryDocumentSnapshot<T>) => void): void {
    this.docs.forEach(cb);
  }
  docChanges(): DocumentChange<T>[] {
    const prev = this.prev ?? [];
    const prevIdx = new Map(prev.map((e, i) => [e.path, i]));
    const nextIdx = new Map(this.entries_.map((e, i) => [e.path, i]));
    const out: DocumentChange<T>[] = [];
    prev.forEach((e, i) => {
      if (!nextIdx.has(e.path)) {
        out.push({ type: 'removed', doc: new QueryDocumentSnapshot<T>(new DocumentReference<T>(e.path), e.data), oldIndex: i, newIndex: -1 });
      }
    });
    this.entries_.forEach((e, i) => {
      const oi = prevIdx.get(e.path);
      if (oi === undefined) out.push({ type: 'added', doc: this.docs[i], oldIndex: -1, newIndex: i });
      else if (JSON.stringify(prev[oi].data) !== JSON.stringify(e.data)) {
        out.push({ type: 'modified', doc: this.docs[i], oldIndex: oi, newIndex: i });
      }
    });
    return out;
  }
}

// ---------------------------------------------------------------- reads

export async function getDoc<T>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  const res = await lan().request<DocEntry>({ t: 'get', path: ref.path });
  return new DocumentSnapshot<T>(ref, res.data ?? null);
}
export const getDocFromServer = getDoc;
export const getDocFromCache = getDoc;

export async function getDocs<T>(q: Query<T>): Promise<QuerySnapshot<T>> {
  const docs = await lan().request<DocEntry[]>({ t: 'query', q: q._spec });
  return new QuerySnapshot<T>(q, docs);
}
export const getDocsFromServer = getDocs;
export const getDocsFromCache = getDocs;

export async function getCountFromServer(q: Query<any>): Promise<{ data: () => { count: number } }> {
  const count = await lan().request<number>({ t: 'count', q: q._spec });
  return { data: () => ({ count }) };
}

type Observer<S> = { next?: (s: S) => void; error?: (e: LanError) => void; complete?: () => void };

export interface SnapshotListenOptions {
  includeMetadataChanges?: boolean;
  source?: 'default' | 'cache';
}
type OnError = (e: LanError) => void;

export function onSnapshot<T>(ref: DocumentReference<T>, onNext: (s: DocumentSnapshot<T>) => void, onError?: OnError, onCompletion?: () => void): Unsubscribe;
export function onSnapshot<T>(ref: DocumentReference<T>, observer: Observer<DocumentSnapshot<T>>): Unsubscribe;
export function onSnapshot<T>(ref: DocumentReference<T>, options: SnapshotListenOptions, onNext: (s: DocumentSnapshot<T>) => void, onError?: OnError): Unsubscribe;
export function onSnapshot<T>(ref: Query<T>, onNext: (s: QuerySnapshot<T>) => void, onError?: OnError, onCompletion?: () => void): Unsubscribe;
export function onSnapshot<T>(ref: Query<T>, observer: Observer<QuerySnapshot<T>>): Unsubscribe;
export function onSnapshot<T>(ref: Query<T>, options: SnapshotListenOptions, onNext: (s: QuerySnapshot<T>) => void, onError?: OnError): Unsubscribe;
export function onSnapshot(ref: DocumentReference<any> | Query<any>, ...args: any[]): Unsubscribe {
  // Signatures: (ref, next, error?) | (ref, observer) | (ref, options, next, error?) | (ref, options, observer)
  if (args[0] && typeof args[0] === 'object' && !('next' in args[0]) && !('error' in args[0]) && typeof args[1] !== 'undefined') args.shift();
  const obs: Observer<any> = typeof args[0] === 'function' ? { next: args[0], error: args[1] } : args[0] ?? {};
  let active = true;
  let prev: DocEntry[] | null = null;
  const handle = (m: ServerMessage) => {
    if (!active) return;
    if (m.t === 'subError') {
      obs.error?.(new LanError(m.error.code, m.error.message));
      return;
    }
    if (m.t !== 'snap') return;
    if (ref instanceof DocumentReference) obs.next?.(new DocumentSnapshot(ref, m.doc?.data ?? null));
    else {
      const docs = m.docs ?? [];
      obs.next?.(new QuerySnapshot(ref, docs, prev));
      prev = docs;
    }
  };
  const req = ref instanceof DocumentReference ? { t: 'sub' as const, sid: '', path: ref.path } : { t: 'sub' as const, sid: '', q: ref._spec };
  const unsub = lan().subscribe(req, handle);
  return () => {
    active = false;
    unsub();
  };
}

// ---------------------------------------------------------------- writes

function encodeData(data: unknown): JsonObject {
  return encode(data) as JsonObject;
}
function encodeUpdate(args: unknown[]): JsonObject {
  if (args.length === 1) return encodeData(args[0]);
  const out: JsonObject = {};
  for (let i = 0; i + 1 < args.length; i += 2) out[fname(args[i] as string)] = encode(args[i + 1]);
  return out;
}

async function commit(ops: WriteOp[]): Promise<void> {
  await lan().request({ t: 'write', ops });
}

export async function setDoc(ref: DocumentReference<any>, data: unknown, opts?: SetOptions): Promise<void> {
  await commit([{ op: 'set', path: ref.path, data: encodeData(data), merge: !!(opts?.merge || opts?.mergeFields) }]);
}
export async function updateDoc(ref: DocumentReference<any>, ...args: unknown[]): Promise<void> {
  await commit([{ op: 'update', path: ref.path, data: encodeUpdate(args) }]);
}
export async function deleteDoc(ref: DocumentReference<any>): Promise<void> {
  await commit([{ op: 'delete', path: ref.path }]);
}
export async function addDoc<T>(ref: CollectionReference<T>, data: unknown): Promise<DocumentReference<T>> {
  const d = doc(ref) as unknown as DocumentReference<T>;
  await setDoc(d, data);
  return d;
}

export class WriteBatch {
  private ops: WriteOp[] = [];
  set(ref: DocumentReference<any>, data: unknown, opts?: SetOptions): WriteBatch {
    this.ops.push({ op: 'set', path: ref.path, data: encodeData(data), merge: !!(opts?.merge || opts?.mergeFields) });
    return this;
  }
  update(ref: DocumentReference<any>, ...args: unknown[]): WriteBatch {
    this.ops.push({ op: 'update', path: ref.path, data: encodeUpdate(args) });
    return this;
  }
  delete(ref: DocumentReference<any>): WriteBatch {
    this.ops.push({ op: 'delete', path: ref.path });
    return this;
  }
  async commit(): Promise<void> {
    const ops = this.ops;
    this.ops = [];
    if (ops.length) await commit(ops);
  }
}
export function writeBatch(_db?: Firestore): WriteBatch {
  return new WriteBatch();
}

export class Transaction {
  private batch = new WriteBatch();
  get<T>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
    return getDoc(ref);
  }
  set(ref: DocumentReference<any>, data: unknown, opts?: SetOptions): Transaction {
    this.batch.set(ref, data, opts);
    return this;
  }
  update(ref: DocumentReference<any>, ...args: unknown[]): Transaction {
    this.batch.update(ref, ...args);
    return this;
  }
  delete(ref: DocumentReference<any>): Transaction {
    this.batch.delete(ref);
    return this;
  }
  _commit(): Promise<void> {
    return this.batch.commit();
  }
}
export async function runTransaction<R>(_db: Firestore, fn: (tx: Transaction) => Promise<R>): Promise<R> {
  const tx = new Transaction();
  const r = await fn(tx);
  await tx._commit();
  return r;
}

export const serverTimestamp = (): FieldValue => FieldValue.serverTimestamp();
export const deleteField = (): FieldValue => FieldValue.delete();
export const increment = (n: number): FieldValue => FieldValue.increment(n);
export const arrayUnion = (...v: unknown[]): FieldValue => FieldValue.arrayUnion(...v);
export const arrayRemove = (...v: unknown[]): FieldValue => FieldValue.arrayRemove(...v);

export function connectFirestoreEmulator(): void {}
export async function enableIndexedDbPersistence(): Promise<void> {}
export async function enableMultiTabIndexedDbPersistence(): Promise<void> {}
export function persistentLocalCache(): object {
  return {};
}
export function persistentMultipleTabManager(): object {
  return {};
}
