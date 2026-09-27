import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { encode } from '../../src/lan/shared/codec';
import { splitPath, type JsonObject } from '../../src/lan/shared/values';
import type { AuthUserInfo, ClientMessage, ServerMessage } from '../../src/lan/shared/protocol';
import { StoreError } from './docStore';
import { invokeCallable, toRpcError } from './functionsHost';
import { allowDoc, allowTreeRead, allowTreeWrite, getAdminEmail, setAdminEmail } from './rules';
import { normalize } from './treeStore';
import { rt } from './runtime';
import type { Persistence } from './persistence';

const denied = () => new StoreError('permission-denied', 'Missing or insufficient permissions.');

class Connection {
  user: AuthUserInfo | null = null;
  token: string | null = null;
  subs = new Map<string, () => void>();

  constructor(private ws: WebSocket, private persistence: Persistence) {}

  send(msg: ServerMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    for (const unsub of this.subs.values()) unsub();
    this.subs.clear();
  }

  async handle(msg: ClientMessage): Promise<unknown> {
    const { docs, tree, auth } = rt();
    switch (msg.t) {
      case 'hello':
        this.token = msg.token;
        this.user = auth.resolveToken(msg.token);
        return { user: this.user, adminEmail: getAdminEmail(), addresses: rt().publicUrls };

      case 'signUp': {
        const first = auth.userCount() === 0;
        const res = auth.signUp(msg.email, msg.password);
        if (first) {
          setAdminEmail(res.user.email);
          this.persistence.saveKv('adminEmail', res.user.email!);
          console.log(`[auth] first account ${res.user.email} is the administrator`);
        }
        this.token = res.token;
        this.user = res.user;
        return { ...res, adminEmail: getAdminEmail() };
      }
      case 'signIn': {
        const res = auth.signIn(msg.email, msg.password);
        this.token = res.token;
        this.user = res.user;
        return { ...res, adminEmail: getAdminEmail() };
      }
      case 'signOut':
        if (this.token) auth.revokeToken(this.token);
        this.token = null;
        this.user = null;
        return null;
      case 'updateProfile':
        if (!this.user) throw new StoreError('auth/requires-recent-login', 'Not signed in');
        this.user = auth.updateProfile(this.user.uid, msg);
        return this.user;
      case 'updatePassword':
        if (!this.user) throw new StoreError('auth/requires-recent-login', 'Not signed in');
        auth.setPassword(this.user.uid, msg.password);
        return null;
      case 'reauth':
        if (!this.user) throw new StoreError('auth/requires-recent-login', 'Not signed in');
        auth.verify(msg.email, msg.password, this.user.uid);
        return null;

      case 'get': {
        const data = docs.getDoc(msg.path);
        if (!allowDoc(this.user, 'get', msg.path, data, null)) throw denied();
        return { id: msg.path.slice(msg.path.lastIndexOf('/') + 1), path: msg.path, data };
      }
      case 'query':
        return docs.query(msg.q).filter((d) => allowDoc(this.user, 'list', d.path, d.data, null));
      case 'count':
        return docs.query(msg.q).filter((d) => allowDoc(this.user, 'list', d.path, d.data, null)).length;
      case 'write': {
        const staged = docs.preview(msg.ops);
        for (const c of staged) {
          const access = c.after === null ? 'delete' : c.before === null ? 'create' : 'update';
          if (!allowDoc(this.user, access, c.path, c.before, c.after)) throw denied();
        }
        docs.apply(staged);
        return null;
      }
      case 'sub': {
        this.subs.get(msg.sid)?.();
        const sid = msg.sid;
        if (msg.path) {
          const path = msg.path;
          const id = path.slice(path.lastIndexOf('/') + 1);
          const unsub = docs.watchDoc(path, (data) => {
            if (!allowDoc(this.user, 'get', path, data, null)) {
              this.send({ t: 'subError', sid, error: { code: 'permission-denied', message: 'Missing or insufficient permissions.' } });
              return;
            }
            this.send({ t: 'snap', sid, path, doc: { id, path, data: data as JsonObject } });
          });
          this.subs.set(sid, unsub);
        } else if (msg.q) {
          const unsub = docs.watchQuery(msg.q, (list) => {
            this.send({ t: 'snap', sid, docs: list.filter((d) => allowDoc(this.user, 'list', d.path, d.data, null)) });
          });
          this.subs.set(sid, unsub);
        }
        return null;
      }
      case 'unsub':
        this.subs.get(msg.sid)?.();
        this.subs.delete(msg.sid);
        return null;

      case 'rget':
        if (!allowTreeRead(this.user, msg.path)) throw denied();
        return tree.get(msg.path);
      case 'rsub': {
        if (!allowTreeRead(this.user, msg.path)) throw denied();
        this.subs.get(msg.sid)?.();
        const sid = msg.sid;
        this.subs.set(sid, tree.watch(msg.path, (value) => this.send({ t: 'rsnap', sid, value })));
        return null;
      }
      case 'rset': {
        const value = normalize(msg.value, Date.now());
        if (!allowTreeWrite(this.user, msg.path, tree.get(msg.path), value)) throw denied();
        tree.set(msg.path, value);
        return null;
      }
      case 'rupdate': {
        const base = splitPath(msg.path);
        const now = Date.now();
        for (const [k, v] of Object.entries(msg.value)) {
          const p = [...base, ...splitPath(k)].join('/');
          if (!allowTreeWrite(this.user, p, tree.get(p), normalize(v, now))) throw denied();
        }
        tree.update(msg.path, msg.value);
        return null;
      }

      case 'call':
        return encode(await invokeCallable(msg.name, msg.data, this.user));

      default:
        throw new StoreError('invalid-argument', 'Unknown request');
    }
  }
}

export function attachWebSocket(server: Server, persistence: Persistence): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 * 1024 });
  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const conn = new Connection(ws, persistence);
    let alive = true;
    ws.on('pong', () => (alive = true));
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 20_000);

    ws.on('message', async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }
      try {
        const data = await conn.handle(msg);
        conn.send({ t: 'res', id: msg.id, ok: true, data: data ?? null });
      } catch (err) {
        conn.send({ t: 'res', id: msg.id, ok: false, error: toRpcError(err) });
      }
    });
    ws.on('close', () => {
      clearInterval(ping);
      conn.close();
    });
  });
  return wss;
}
