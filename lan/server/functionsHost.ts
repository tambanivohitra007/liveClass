import { decode } from '../../src/lan/shared/codec';
import { splitPath, type Json } from '../../src/lan/shared/values';
import type { AuthUserInfo, RpcError } from '../../src/lan/shared/protocol';
import { DocumentReference, Reference } from './shims/firebase-admin';
import { HttpsError, type CallableRequest, type FunctionDef } from './shims/firebase-functions';
import { StoreError } from './docStore';
import { rt } from './runtime';

type Handler = (req: CallableRequest) => unknown;

const callables = new Map<string, Handler>();

/** Functions that exist only in Firebase and make no sense on a LAN. */
const DISABLED = new Set(['sendGameStartNotification', 'emailSessionResults']);

function matchDocPattern(pattern: string, docPath: string): Record<string, string> | null {
  const pp = splitPath(pattern);
  const dp = splitPath(docPath);
  if (pp.length !== dp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith('{')) params[pp[i].slice(1, -1)] = dp[i];
    else if (pp[i] !== dp[i]) return null;
  }
  return params;
}

function parseSchedule(s: string): number | null {
  const m = /every\s+(\d+)\s+(minute|hour|day)s?/i.exec(s);
  if (!m) return null;
  const unit = { minute: 60_000, hour: 3_600_000, day: 86_400_000 }[m[2].toLowerCase() as 'minute' | 'hour' | 'day'];
  return Number(m[1]) * unit;
}

function logFailure(name: string, err: unknown): void {
  console.error(`[functions] ${name} failed:`, err instanceof Error ? err.stack ?? err.message : err);
}

/** Registers every Cloud Function exported by a module (functions/src/index.ts, lan/server/games, ...). */
export function registerModule(mod: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(mod)) {
    const def = value as FunctionDef | undefined;
    if (!def || typeof def !== 'object' || !('__lan' in def)) continue;
    switch (def.__lan) {
      case 'call':
        if (!DISABLED.has(name)) callables.set(name, def.handler);
        break;
      case 'rtdbCreated':
        rt().tree.onValueCreated(def.ref, (params, value) => {
          const ref = new Reference(splitPath(def.ref).map((p) => (p.startsWith('{') ? params[p.slice(1, -1)] : p)).join('/'));
          const data = { key: ref.key, ref, val: () => value, exists: () => value !== null, toJSON: () => value };
          Promise.resolve(def.handler({ params, data })).catch((e) => logFailure(name, e));
        });
        break;
      case 'docCreated':
        rt().docs.on('change', (c: { path: string; before: unknown; after: unknown }) => {
          if (c.before !== null || c.after === null) return;
          const params = matchDocPattern(def.document, c.path);
          if (!params) return;
          const ref = new DocumentReference(c.path);
          const data = { id: ref.id, ref, exists: true, data: () => decode(structuredClone(c.after)) };
          Promise.resolve(def.handler({ params, data })).catch((e) => logFailure(name, e));
        });
        break;
      case 'schedule': {
        const ms = parseSchedule(def.schedule);
        if (ms) setInterval(() => Promise.resolve(def.handler()).catch((e) => logFailure(name, e)), ms).unref();
        break;
      }
    }
  }
}

export function registerCallable(name: string, handler: Handler): void {
  callables.set(name, handler);
}

export function toRpcError(err: unknown): RpcError {
  if (err instanceof HttpsError) return { code: err.code, message: err.message, details: (err.details ?? null) as Json };
  if (err instanceof StoreError) return { code: err.code, message: err.message };
  console.error('[functions] unexpected error', err);
  return { code: 'internal', message: 'Internal error' };
}

export async function invokeCallable(name: string, data: unknown, user: AuthUserInfo | null): Promise<unknown> {
  const handler = callables.get(name);
  if (!handler) throw new HttpsError('unimplemented', `"${name}" is not available in offline (LAN) mode`);
  return handler({
    data: decode(data),
    auth: user ? { uid: user.uid, token: { email: user.email ?? undefined, name: user.displayName ?? undefined } } : undefined,
  });
}
