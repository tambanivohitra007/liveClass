// Drop-in replacement for `firebase/functions`: callables run on the LAN server.
import { lan, LanError } from './connection';
import { decode, encode } from './shared/codec';

export class Functions {
  readonly type = 'functions';
}
const fns = new Functions();
export function getFunctions(_app?: unknown, _region?: string): Functions {
  return fns;
}

export type FunctionsError = LanError;
export interface HttpsCallableResult<T> {
  readonly data: T;
}
export type HttpsCallable<Req = unknown, Res = unknown> = (data?: Req) => Promise<HttpsCallableResult<Res>>;

export function httpsCallable<Req = unknown, Res = unknown>(_f: Functions, name: string, _opts?: unknown): HttpsCallable<Req, Res> {
  return async (data?: Req) => {
    try {
      const res = await lan().request({ t: 'call', name, data: encode(data ?? null) });
      return { data: decode(res) as Res };
    } catch (err) {
      if (err instanceof LanError && !err.code.startsWith('functions/')) {
        throw new LanError(`functions/${err.code}`, err.message, err.details);
      }
      throw err;
    }
  };
}

export function connectFunctionsEmulator(): void {}
