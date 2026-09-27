// Single WebSocket to the LiveClass LAN server with request/response, subscriptions,
// automatic reconnection (classroom Wi-Fi drops) and re-subscription.
import type { AuthUserInfo, ClientRequest, RpcError, ServerMessage } from './shared/protocol';

const TOKEN_KEY = 'liveclass.lan.token';

export class LanError extends Error {
  readonly code: string;
  readonly details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'FirebaseError';
  }
}

type Pending = { req: ClientRequest; resolve: (v: unknown) => void; reject: (e: unknown) => void };
type SubHandler = { req: ClientRequest; onMessage: (m: ServerMessage) => void };

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

class Connection {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private nextSid = 1;
  private pending = new Map<number, Pending>();
  private queue: { id: number; req: ClientRequest }[] = [];
  private subs = new Map<string, SubHandler>();
  private ready = false;
  private retry = 0;
  private statusListeners = new Set<(online: boolean) => void>();
  private authListeners = new Set<(u: AuthUserInfo | null) => void>();

  user: AuthUserInfo | null = null;
  /** Resolves once the first hello (token check) has completed. */
  readonly authReady: Promise<void>;
  private resolveAuthReady!: () => void;

  constructor() {
    this.authReady = new Promise((r) => (this.resolveAuthReady = r));
    this.open();
  }

  private url(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const override = import.meta.env.VITE_LAN_SERVER as string | undefined;
    return override ? override.replace(/^http/, 'ws') + '/ws' : `${proto}//${location.host}/ws`;
  }

  private open(): void {
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = async () => {
      this.retry = 0;
      // Authenticate before anything else so rules see the right user.
      const hello = { t: 'hello', token: readToken() } as ClientRequest;
      const id = this.nextId++;
      const p = new Promise<unknown>((resolve, reject) => this.pending.set(id, { req: hello, resolve, reject }));
      ws.send(JSON.stringify({ ...hello, id }));
      try {
        const res = (await p) as { user: AuthUserInfo | null; adminEmail: string | null; addresses?: string[] };
        this.setAddresses(res.addresses ?? []);
        if (!res.user && readToken()) writeToken(null);
        this.setAdminEmail(res.adminEmail);
        this.setUser(res.user);
      } catch {
        this.setUser(null);
      }
      this.resolveAuthReady();
      this.ready = true;
      for (const [sid, s] of this.subs) this.sendRaw(this.nextId++, { ...s.req, sid } as ClientRequest);
      const queued = this.queue;
      this.queue = [];
      for (const q of queued) this.sendRaw(q.id, q.req);
      this.statusListeners.forEach((l) => l(true));
    };
    ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data as string) as ServerMessage);
    ws.onclose = () => {
      const wasReady = this.ready;
      this.ready = false;
      this.ws = null;
      // Requests in flight are retried after reconnecting (all are idempotent or client-id based).
      for (const [id, p] of this.pending) if (p.req.t !== 'hello') this.queue.push({ id, req: p.req });
      for (const [id, p] of this.pending) if (p.req.t === 'hello') this.pending.delete(id);
      if (wasReady) this.statusListeners.forEach((l) => l(false));
      const delay = Math.min(5000, 300 * 2 ** this.retry++);
      setTimeout(() => this.open(), delay);
    };
  }

  private sendRaw(id: number, req: ClientRequest): void {
    this.ws?.send(JSON.stringify({ ...req, id }));
  }

  private onMessage(msg: ServerMessage): void {
    if (msg.t === 'res') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.data);
      else p.reject(toError(msg.error));
      return;
    }
    if ('sid' in msg) this.subs.get(msg.sid)?.onMessage(msg);
  }

  request<T = unknown>(req: ClientRequest): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { req, resolve: resolve as (v: unknown) => void, reject });
      if (this.ready) this.sendRaw(id, req);
      else this.queue.push({ id, req });
    });
  }

  subscribe(req: ClientRequest, onMessage: (m: ServerMessage) => void): () => void {
    const sid = `s${this.nextSid++}`;
    this.subs.set(sid, { req, onMessage });
    if (this.ready) this.sendRaw(this.nextId++, { ...req, sid } as ClientRequest);
    return () => {
      if (!this.subs.delete(sid)) return;
      if (this.ready) this.sendRaw(this.nextId++, { t: 'unsub', sid });
    };
  }

  setUser(user: AuthUserInfo | null): void {
    this.user = user;
    this.authListeners.forEach((l) => l(user));
  }

  /** Addresses of this server that other devices on the LAN can open. */
  addresses: string[] = [];
  private addressListeners = new Set<(a: string[]) => void>();

  setAddresses(a: string[]): void {
    this.addresses = a;
    this.addressListeners.forEach((l) => l(a));
  }

  onAddresses(cb: (a: string[]) => void): () => void {
    this.addressListeners.add(cb);
    cb(this.addresses);
    return () => this.addressListeners.delete(cb);
  }

  /** The first account created on this server is the administrator. */
  adminEmail: string | null = null;
  private adminListeners = new Set<(email: string | null) => void>();

  setAdminEmail(email: string | null | undefined): void {
    if (email === undefined || email === this.adminEmail) return;
    this.adminEmail = email;
    this.adminListeners.forEach((l) => l(email));
  }

  onAdminEmail(cb: (email: string | null) => void): () => void {
    this.adminListeners.add(cb);
    cb(this.adminEmail);
    return () => this.adminListeners.delete(cb);
  }

  setToken(token: string | null): void {
    writeToken(token);
  }

  onAuth(cb: (u: AuthUserInfo | null) => void): () => void {
    this.authListeners.add(cb);
    return () => this.authListeners.delete(cb);
  }

  onStatus(cb: (online: boolean) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  get online(): boolean {
    return this.ready;
  }

  /** Re-sends every subscription so the server re-evaluates permissions for a new identity. */
  resubscribeAll(): void {
    if (!this.ready) return;
    for (const [sid, s] of this.subs) this.sendRaw(this.nextId++, { ...s.req, sid } as ClientRequest);
  }
}

function toError(e: RpcError): LanError {
  // Mirror the Firebase SDKs: Firestore uses bare codes, Functions uses "functions/<code>".
  return new LanError(e.code, e.message, e.details);
}

let instance: Connection | null = null;
export function lan(): Connection {
  if (!instance) instance = new Connection();
  return instance;
}
