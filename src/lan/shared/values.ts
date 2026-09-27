// Value encoding shared by the LAN server and the browser client.
//
// Documents travel and are stored as plain JSON. Two kinds of special objects exist:
//   { __t: <millis> }          a Firestore Timestamp
//   { __fv: <kind>, ... }      a FieldValue sentinel (only inside writes, resolved by the server)
// Realtime-Database writes use Firebase's own sentinel `{ ".sv": "timestamp" }`.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

export type FieldValueSentinel =
  | { __fv: 'serverTimestamp' }
  | { __fv: 'increment'; n: number }
  | { __fv: 'arrayUnion'; v: Json[] }
  | { __fv: 'arrayRemove'; v: Json[] }
  | { __fv: 'delete' };

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isTs(v: unknown): v is { __t: number } {
  return isPlainObject(v) && typeof v.__t === 'number' && Object.keys(v).length === 1;
}

export function isSentinel(v: unknown): v is FieldValueSentinel {
  return isPlainObject(v) && typeof v.__fv === 'string';
}

export function getField(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

// ---------- ordering (Firestore type order: null < bool < number < timestamp < string < array < map)

function typeRank(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'boolean') return 1;
  if (typeof v === 'number') return 2;
  if (isTs(v)) return 3;
  if (typeof v === 'string') return 4;
  if (Array.isArray(v)) return 6;
  return 7;
}

export function compareValues(a: unknown, b: unknown): number {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  switch (ra) {
    case 0: return 0;
    case 1: return (a ? 1 : 0) - (b ? 1 : 0);
    case 2: return (a as number) - (b as number);
    case 3: return (a as { __t: number }).__t - (b as { __t: number }).__t;
    case 4: return (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0;
    case 6: {
      const aa = a as unknown[];
      const bb = b as unknown[];
      for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
        const c = compareValues(aa[i], bb[i]);
        if (c !== 0) return c;
      }
      return aa.length - bb.length;
    }
    default: {
      const ka = Object.keys(a as object).sort();
      const kb = Object.keys(b as object).sort();
      for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
        if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
        const c = compareValues((a as Record<string, unknown>)[ka[i]], (b as Record<string, unknown>)[kb[i]]);
        if (c !== 0) return c;
      }
      return ka.length - kb.length;
    }
  }
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  return typeRank(a) === typeRank(b) && compareValues(a, b) === 0;
}

// ---------- queries

export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any';

export interface QuerySpec {
  /** Collection path, or the collection id when `group` is true. */
  path: string;
  group?: boolean;
  where: [string, WhereOp, Json][];
  orderBy: [string, 'asc' | 'desc'][];
  limit?: number;
  limitToLast?: number;
  startAfter?: Json[];
  startAt?: Json[];
  endBefore?: Json[];
  endAt?: Json[];
}

export const DOC_ID_FIELD = '__name__';

export function matchesWhere(id: string, data: JsonObject, [field, op, value]: [string, WhereOp, Json]): boolean {
  const v = field === DOC_ID_FIELD ? id : getField(data, field);
  switch (op) {
    case '==': return v !== undefined && valuesEqual(v, value);
    case '!=': return v !== undefined && v !== null && !valuesEqual(v, value);
    case '<': return v !== undefined && typeRank(v) === typeRank(value) && compareValues(v, value) < 0;
    case '<=': return v !== undefined && typeRank(v) === typeRank(value) && compareValues(v, value) <= 0;
    case '>': return v !== undefined && typeRank(v) === typeRank(value) && compareValues(v, value) > 0;
    case '>=': return v !== undefined && typeRank(v) === typeRank(value) && compareValues(v, value) >= 0;
    case 'in': return v !== undefined && Array.isArray(value) && value.some((x) => valuesEqual(v, x));
    case 'not-in': return v !== undefined && v !== null && Array.isArray(value) && !value.some((x) => valuesEqual(v, x));
    case 'array-contains': return Array.isArray(v) && v.some((x) => valuesEqual(x, value));
    case 'array-contains-any':
      return Array.isArray(v) && Array.isArray(value) && v.some((x) => value.some((y) => valuesEqual(x, y)));
    default: return false;
  }
}

export interface DocEntry { id: string; path: string; data: JsonObject }

/** Filters, orders and limits documents the same way Firestore does for the supported subset. */
export function runQuery(docs: Iterable<DocEntry>, q: QuerySpec): DocEntry[] {
  let out: DocEntry[] = [];
  const orderFields = q.orderBy.map(([f]) => f);
  for (const d of docs) {
    if (!q.where.every((w) => matchesWhere(d.id, d.data, w))) continue;
    // Firestore excludes docs missing an orderBy field.
    if (orderFields.some((f) => f !== DOC_ID_FIELD && getField(d.data, f) === undefined)) continue;
    out.push(d);
  }
  const order: [string, 'asc' | 'desc'][] = [...q.orderBy];
  // Implicit order: inequality fields first, then document id.
  for (const [f, op] of q.where) {
    if (['<', '<=', '>', '>=', '!=', 'not-in'].includes(op) && !order.some(([of]) => of === f)) order.unshift([f, 'asc']);
  }
  const cmp = (a: DocEntry, b: DocEntry) => {
    for (const [f, dir] of order) {
      const c = f === DOC_ID_FIELD ? compareValues(a.id, b.id) : compareValues(getField(a.data, f), getField(b.data, f));
      if (c !== 0) return dir === 'desc' ? -c : c;
    }
    return compareValues(a.path, b.path);
  };
  if (order.length === 0) {
    // No explicit ordering: honour a numeric `order` field (question sets), else keep creation order.
    // (Firestore would use document-id order, which is random for auto ids.)
    out.sort((a, b) => {
      const oa = a.data.order;
      const ob = b.data.order;
      return typeof oa === 'number' && typeof ob === 'number' ? oa - ob : 0;
    });
  } else out.sort(cmp);

  const cursorCmp = (d: DocEntry, values: Json[]) => {
    for (let i = 0; i < values.length && i < order.length; i++) {
      const [f, dir] = order[i];
      const c = f === DOC_ID_FIELD ? compareValues(d.id, values[i]) : compareValues(getField(d.data, f), values[i]);
      if (c !== 0) return dir === 'desc' ? -c : c;
    }
    return 0;
  };
  if (q.startAfter) out = out.filter((d) => cursorCmp(d, q.startAfter!) > 0);
  if (q.startAt) out = out.filter((d) => cursorCmp(d, q.startAt!) >= 0);
  if (q.endBefore) out = out.filter((d) => cursorCmp(d, q.endBefore!) < 0);
  if (q.endAt) out = out.filter((d) => cursorCmp(d, q.endAt!) <= 0);
  if (q.limit !== undefined) out = out.slice(0, q.limit);
  if (q.limitToLast !== undefined) out = out.slice(Math.max(0, out.length - q.limitToLast));
  return out;
}

// ---------- writes

function resolveSentinel(existing: unknown, s: FieldValueSentinel, now: number): Json | undefined {
  switch (s.__fv) {
    case 'serverTimestamp': return { __t: now };
    case 'increment': return (typeof existing === 'number' ? existing : 0) + s.n;
    case 'arrayUnion': {
      const arr = Array.isArray(existing) ? [...(existing as Json[])] : [];
      for (const x of s.v) if (!arr.some((y) => valuesEqual(x, y))) arr.push(x);
      return arr;
    }
    case 'arrayRemove':
      return Array.isArray(existing) ? (existing as Json[]).filter((y) => !s.v.some((x) => valuesEqual(x, y))) : [];
    case 'delete': return undefined;
  }
}

/** Resolves sentinels inside a value that is being written wholesale (no merge). */
function resolveDeep(value: unknown, existing: unknown, now: number): Json | undefined {
  if (isSentinel(value)) return resolveSentinel(existing, value, now);
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, undefined, now) ?? null);
  if (isPlainObject(value) && !isTs(value)) {
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      const r = resolveDeep(v, isPlainObject(existing) ? existing[k] : undefined, now);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }
  return value as Json;
}

function mergeDeep(target: JsonObject, src: Record<string, unknown>, now: number): void {
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined) continue;
    if (isPlainObject(v) && !isSentinel(v) && !isTs(v)) {
      if (!isPlainObject(target[k]) || isTs(target[k])) target[k] = {};
      mergeDeep(target[k] as JsonObject, v, now);
    } else {
      const r = resolveDeep(v, target[k], now);
      if (r === undefined) delete target[k];
      else target[k] = r;
    }
  }
}

function setPath(target: JsonObject, path: string, value: unknown, now: number): void {
  const parts = path.split('.');
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur[parts[i]]) || isTs(cur[parts[i]])) cur[parts[i]] = {};
    cur = cur[parts[i]] as JsonObject;
  }
  const last = parts[parts.length - 1];
  const r = resolveDeep(value, cur[last], now);
  if (r === undefined) delete cur[last];
  else cur[last] = r;
}

export function applySet(existing: JsonObject | null, data: Record<string, unknown>, merge: boolean, now: number): JsonObject {
  if (!merge || !existing) {
    const r = resolveDeep(data, existing ?? undefined, now);
    return (r as JsonObject) ?? {};
  }
  const out = structuredClone(existing);
  mergeDeep(out, data, now);
  return out;
}

/** `update` semantics: keys are field paths; values replace (no deep merge). */
export function applyUpdate(existing: JsonObject, data: Record<string, unknown>, now: number): JsonObject {
  const out = structuredClone(existing);
  for (const [path, v] of Object.entries(data)) {
    if (v === undefined) continue;
    setPath(out, path, v, now);
  }
  return out;
}

// ---------- ids

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function autoId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ID_CHARS[b % ID_CHARS.length];
  return s;
}

// ---------- paths

export function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

export function joinPath(...parts: string[]): string {
  return parts.flatMap(splitPath).join('/');
}
