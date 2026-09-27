// Local implementation of `firebase-functions` (v2 API) for the LAN server.
// Every `firebase-functions/*` import is aliased here. Definitions are inert descriptors;
// lan/server/functionsHost.ts discovers them among the module's exports and wires them up.
/* eslint-disable @typescript-eslint/no-explicit-any */

export class HttpsError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

export interface CallableRequest {
  data: any;
  auth?: { uid: string; token: { email?: string; name?: string; [k: string]: unknown } };
  rawRequest?: unknown;
}

export type FunctionDef =
  | { __lan: 'call'; handler: (req: CallableRequest) => unknown }
  | { __lan: 'schedule'; schedule: string; handler: () => unknown }
  | { __lan: 'rtdbCreated'; ref: string; handler: (event: any) => unknown }
  | { __lan: 'docCreated'; document: string; handler: (event: any) => unknown };

type Opts = Record<string, any>;

function split<H>(a: Opts | string | H, b?: H): [Opts, H] {
  return b === undefined ? [{}, a as H] : [typeof a === 'string' ? { __path: a } : (a as Opts), b];
}

export function onCall(a: Opts | ((req: CallableRequest) => unknown), b?: (req: CallableRequest) => unknown): FunctionDef {
  const [, handler] = split(a, b);
  return { __lan: 'call', handler };
}

export function onSchedule(a: Opts | string, b: () => unknown): FunctionDef {
  const opts = typeof a === 'string' ? { schedule: a } : a;
  return { __lan: 'schedule', schedule: opts.schedule, handler: b };
}

export function onValueCreated(a: Opts | string, b: (event: any) => unknown): FunctionDef {
  const opts = typeof a === 'string' ? { ref: a } : a;
  return { __lan: 'rtdbCreated', ref: opts.ref, handler: b };
}

export function onDocumentCreated(a: Opts | string, b: (event: any) => unknown): FunctionDef {
  const opts = typeof a === 'string' ? { document: a } : a;
  return { __lan: 'docCreated', document: opts.document, handler: b };
}

export function defineSecret(name: string) {
  return { name, value: () => process.env[name] ?? '' };
}

export function defineString(name: string, opts?: { default?: string }) {
  return { name, value: () => process.env[name] ?? opts?.default ?? '' };
}

export const logger = {
  log: (...a: unknown[]) => console.log(...a),
  info: (...a: unknown[]) => console.info(...a),
  warn: (...a: unknown[]) => console.warn(...a),
  error: (...a: unknown[]) => console.error(...a),
  debug: () => {},
};

export const https = { onCall, HttpsError };
