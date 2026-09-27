import fs from 'node:fs';
import path from 'node:path';

/**
 * Serves the built web client either from the embedded Single-Executable assets
 * (production LiveClass.exe) or from ./dist on disk (development).
 */
export interface StaticSource {
  read(urlPath: string): Buffer | null;
  describe: string;
}

interface SeaModule {
  isSea(): boolean;
  getAsset(key: string): ArrayBuffer;
}

/** node:sea exists only in Node ≥ 20; inside a Single Executable, plain require can still load built-ins. */
function sea(): SeaModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay a runtime require inside the SEA bundle
    return require('node:sea') as SeaModule;
  } catch {
    return null;
  }
}

function isSea(): boolean {
  return sea()?.isSea() ?? false;
}

export function openStatic(): StaticSource {
  if (isSea()) {
    const assets = sea()!;
    const cache = new Map<string, Buffer | null>();
    return {
      describe: 'embedded assets',
      read(urlPath) {
        const key = 'web' + urlPath;
        if (!cache.has(key)) {
          try {
            cache.set(key, Buffer.from(assets.getAsset(key)));
          } catch {
            cache.set(key, null);
          }
        }
        return cache.get(key)!;
      },
    };
  }
  const root = path.resolve(process.env.LIVECLASS_WEB ?? 'dist');
  return {
    describe: root,
    read(urlPath) {
      const f = path.resolve(root, '.' + urlPath);
      if (!f.startsWith(root)) return null;
      try {
        return fs.statSync(f).isFile() ? fs.readFileSync(f) : null;
      } catch {
        return null;
      }
    },
  };
}

export function isPackaged(): boolean {
  return isSea();
}

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.glb': 'model/gltf-binary',
};
