import './quiet';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { Persistence } from './persistence';
import { DocStore } from './docStore';
import { TreeStore } from './treeStore';
import { AuthService } from './auth';
import { setRuntime } from './runtime';
import { setAdminEmail, getAdminEmail } from './rules';
import { attachWebSocket } from './wsServer';
import { registerModule } from './functionsHost';
import { MIME, isPackaged, openStatic } from './staticFiles';

const MAX_UPLOAD = 15 * 1024 * 1024;

function dataDirectory(): string {
  if (process.env.LIVECLASS_DATA) return path.resolve(process.env.LIVECLASS_DATA);
  const base = isPackaged() ? path.dirname(process.execPath) : process.cwd();
  return path.join(base, 'liveclass-data');
}

/** Present when running inside the Electron desktop app (spawned with utilityProcess.fork). */
interface ParentPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (e: { data: unknown }) => void): void;
}
const parentPort = (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort;

const VIRTUAL_NIC = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Tailscale|ZeroTier|docker|Loopback|vpn|utun|tun\d/i;

/** IPv4 addresses students can reach; virtual/VPN adapters are hidden unless nothing else exists. */
export function lanAddresses(): string[] {
  const real: string[] = [];
  const virtual: string[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      (VIRTUAL_NIC.test(name) ? virtual : real).push(a.address);
    }
  }
  return real.length ? real : virtual;
}

async function main(): Promise<void> {
  const dataDir = dataDirectory();
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const persistence = new Persistence(dataDir);
  const docs = new DocStore(persistence);
  const tree = new TreeStore(persistence);
  const auth = new AuthService(persistence);
  const runtime = { docs, tree, auth, dataDir, uploadsDir, publicUrls: [] as string[] };
  setRuntime(runtime);
  setAdminEmail(persistence.loadKv('adminEmail'));

  // The original Cloud Functions, running locally against the firebase-admin shim.
  registerModule(await import('../../functions/src/index'));
  registerModule(await import('./arcade'));

  const web = openStatic();
  const port = Number(process.env.PORT ?? 8080);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://local');
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === '/api/config') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({
          adminEmail: getAdminEmail(),
          needsSetup: auth.userCount() === 0,
          addresses: runtime.publicUrls,
        }));
        return;
      }

      if (pathname === '/api/upload' && req.method === 'POST') {
        const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
        const user = auth.resolveToken(token || null);
        if (!user) {
          res.writeHead(401).end('Sign in required');
          return;
        }
        const target = url.searchParams.get('path') ?? '';
        const full = path.resolve(uploadsDir, ...target.split('/').filter((p) => p && p !== '..'));
        if (!full.startsWith(uploadsDir + path.sep)) {
          res.writeHead(400).end('Bad path');
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += (chunk as Buffer).length;
          if (size > MAX_UPLOAD) {
            res.writeHead(413).end('File too large');
            return;
          }
          chunks.push(chunk as Buffer);
        }
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, Buffer.concat(chunks));
        const rel = path.relative(uploadsDir, full).split(path.sep).map(encodeURIComponent).join('/');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ url: `/uploads/${rel}` }));
        return;
      }

      if (pathname.startsWith('/uploads/')) {
        const full = path.resolve(uploadsDir, '.' + pathname.slice('/uploads'.length));
        if (!full.startsWith(uploadsDir) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, {
          'content-type': MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream',
          'cache-control': 'public, max-age=86400',
        });
        fs.createReadStream(full).pipe(res);
        return;
      }

      let file = pathname === '/' ? '/index.html' : pathname;
      let body = web.read(file);
      if (!body) {
        // SPA fallback for client-side routes; real asset misses are 404s.
        if (path.extname(pathname)) {
          res.writeHead(404).end();
          return;
        }
        body = web.read('/index.html');
        file = '/index.html';
      }
      if (!body) {
        res.writeHead(500).end('Web client missing — run "npm run build" first.');
        return;
      }
      const hashed = file.startsWith('/assets/');
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(body);
    } catch (err) {
      console.error('[http]', err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  attachWebSocket(server, persistence);

  const listen = (p: number): Promise<number> =>
    new Promise((resolve, reject) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && p < port + 20) resolve(listen(p + 1));
        else reject(err);
      });
      server.listen(p, '0.0.0.0', () => resolve(p));
    });
  const actual = await listen(port);

  const urls = lanAddresses().map((ip) => `http://${ip}:${actual}`);
  runtime.publicUrls = urls;
  console.log('\n  LiveClass is running (offline / LAN mode)\n');
  console.log(`  Teacher (this computer):  http://localhost:${actual}`);
  for (const u of urls) console.log(`  Students (same Wi-Fi):    ${u}`);
  if (urls.length === 0) console.log('  No network found — connect this computer to the school Wi-Fi or start a hotspot.');
  console.log(`\n  Data folder: ${dataDir}`);
  console.log(`  Web client:  ${web.describe}`);
  console.log('  Keep this window open while class is running. Press Ctrl+C to stop.\n');

  if (isPackaged() && process.platform === 'win32' && !process.env.LIVECLASS_NO_BROWSER) {
    exec(`start "" "http://localhost:${actual}"`);
  }

  const shutdown = () => {
    console.log('\n  Saving data…');
    tree.saveNow();
    persistence.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Desktop app: report the address, and save before exiting (Windows child processes get no SIGTERM).
  if (parentPort) {
    parentPort.on('message', (e) => {
      if ((e.data as { type?: string } | null)?.type === 'shutdown') shutdown();
    });
    parentPort.postMessage({ type: 'ready', port: actual, urls, dataDir });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
