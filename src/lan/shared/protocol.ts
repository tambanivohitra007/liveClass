import type { DocEntry, Json, JsonObject, QuerySpec } from './values';

export type WriteOp =
  | { op: 'set'; path: string; data: JsonObject; merge?: boolean }
  | { op: 'update'; path: string; data: JsonObject }
  | { op: 'delete'; path: string };

export interface AuthUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/** Client → server requests. Every request carries an `id`; the server answers with a `res`. */
export type ClientRequest =
  | { t: 'hello'; token: string | null }
  | { t: 'signIn'; email: string; password: string }
  | { t: 'signUp'; email: string; password: string }
  | { t: 'signOut' }
  | { t: 'updateProfile'; displayName?: string | null; photoURL?: string | null }
  | { t: 'updatePassword'; password: string }
  | { t: 'reauth'; email: string; password: string }
  | { t: 'get'; path: string }
  | { t: 'query'; q: QuerySpec }
  | { t: 'count'; q: QuerySpec }
  | { t: 'write'; ops: WriteOp[] }
  | { t: 'sub'; sid: string; path?: string; q?: QuerySpec }
  | { t: 'rget'; path: string }
  | { t: 'rset'; path: string; value: Json }
  | { t: 'rupdate'; path: string; value: JsonObject }
  | { t: 'rsub'; sid: string; path: string }
  | { t: 'unsub'; sid: string }
  | { t: 'call'; name: string; data: Json };

export type ClientMessage = ClientRequest & { id: number };

export interface RpcError { code: string; message: string; details?: Json }

export type ServerMessage =
  | { t: 'res'; id: number; ok: true; data: unknown }
  | { t: 'res'; id: number; ok: false; error: RpcError }
  | { t: 'snap'; sid: string; doc?: DocEntry | null; path?: string; docs?: DocEntry[] }
  | { t: 'rsnap'; sid: string; value: Json }
  | { t: 'subError'; sid: string; error: RpcError }
  | { t: 'auth'; user: AuthUserInfo | null };

export interface SignInResult { token: string; user: AuthUserInfo; adminEmail?: string | null }
