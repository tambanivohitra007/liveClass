import { isPlainObject, isSentinel, isTs, type FieldValueSentinel, type Json } from './values';

/** Firestore-compatible Timestamp (both the client and the admin SDK shapes). */
export class Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }
  static fromDate(d: Date): Timestamp {
    return Timestamp.fromMillis(d.getTime());
  }
  static fromMillis(ms: number): Timestamp {
    const seconds = Math.floor(ms / 1000);
    return new Timestamp(seconds, Math.round((ms - seconds * 1000) * 1e6));
  }
  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
  toDate(): Date {
    return new Date(this.toMillis());
  }
  isEqual(other: Timestamp): boolean {
    return other instanceof Timestamp && other.toMillis() === this.toMillis();
  }
  valueOf(): string {
    return String(this.toMillis()).padStart(16, '0');
  }
  toJSON(): { seconds: number; nanoseconds: number } {
    return { seconds: this.seconds, nanoseconds: this.nanoseconds };
  }
  toString(): string {
    return `Timestamp(seconds=${this.seconds}, nanoseconds=${this.nanoseconds})`;
  }
}

export class FieldValue {
  readonly sentinel: FieldValueSentinel;
  constructor(sentinel: FieldValueSentinel) {
    this.sentinel = sentinel;
  }
  isEqual(other: FieldValue): boolean {
    return other instanceof FieldValue && JSON.stringify(other.sentinel) === JSON.stringify(this.sentinel);
  }
  static serverTimestamp(): FieldValue {
    return new FieldValue({ __fv: 'serverTimestamp' });
  }
  static increment(n: number): FieldValue {
    return new FieldValue({ __fv: 'increment', n });
  }
  static arrayUnion(...v: unknown[]): FieldValue {
    return new FieldValue({ __fv: 'arrayUnion', v: v.map((x) => encode(x)) });
  }
  static arrayRemove(...v: unknown[]): FieldValue {
    return new FieldValue({ __fv: 'arrayRemove', v: v.map((x) => encode(x)) });
  }
  static delete(): FieldValue {
    return new FieldValue({ __fv: 'delete' });
  }
}

/** Anything with a `.path` that looks like a document reference is stored as its path string. */
function isRefLike(v: unknown): v is { path: string; id: string; type?: string } {
  return typeof v === 'object' && v !== null && typeof (v as { path?: unknown }).path === 'string'
    && typeof (v as { id?: unknown }).id === 'string' && (v as { type?: string }).type === 'document';
}

/** JS value → wire/storage JSON. Drops `undefined` object members like `ignoreUndefinedProperties`. */
export function encode(v: unknown): Json {
  if (v === undefined || v === null) return null;
  if (v instanceof Timestamp) return { __t: v.toMillis() };
  if (v instanceof Date) return { __t: v.getTime() };
  if (v instanceof FieldValue) return v.sentinel as unknown as Json;
  if (Array.isArray(v)) return v.map((x) => encode(x));
  if (isRefLike(v)) return v.path;
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  if (typeof v === 'object') {
    // Timestamp-like objects coming from other libraries or JSON round-trips
    const o = v as Record<string, unknown>;
    if (typeof o.toMillis === 'function') return { __t: (o.toMillis as () => number)() };
    const out: Record<string, Json> = {};
    for (const [k, x] of Object.entries(o)) if (x !== undefined) out[k] = encode(x);
    return out;
  }
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'function' || typeof v === 'symbol') return null;
  return v as Json;
}

/** Wire/storage JSON → JS value (timestamps become Timestamp instances). */
export function decode(v: unknown): unknown {
  if (isTs(v)) return Timestamp.fromMillis(v.__t);
  if (Array.isArray(v)) return v.map(decode);
  if (isPlainObject(v)) {
    if (isSentinel(v)) return new FieldValue(v);
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = decode(x);
    return out;
  }
  return v;
}
