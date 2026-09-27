// Bundles the Electron desktop shell into build/desktop/:
//   main.cjs              main process (lan/desktop/main.ts)
//   titlebarPreload.cjs   preload for the custom title bar
//   appPreload.cjs        preload for the web app view
//   titlebar.html/.js     the title bar page, plus its icon
// The LAN server itself is built separately by lan/build-server.mjs.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => path.join(root, 'lan/desktop', p);
const out = path.join(root, 'build/desktop');

const node = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron'], logLevel: 'info' };

await Promise.all([
  build({ ...node, entryPoints: [src('main.ts')], outfile: path.join(out, 'main.cjs'), sourcemap: 'linked' }),
  build({ ...node, entryPoints: [src('titlebarPreload.ts')], outfile: path.join(out, 'titlebarPreload.cjs') }),
  build({ ...node, entryPoints: [src('appPreload.ts')], outfile: path.join(out, 'appPreload.cjs') }),
  build({
    entryPoints: [src('titlebar.ts')],
    outfile: path.join(out, 'titlebar.js'),
    bundle: true,
    platform: 'browser',
    target: 'chrome130',
    format: 'iife',
    logLevel: 'info',
  }),
]);

fs.copyFileSync(src('titlebar.html'), path.join(out, 'titlebar.html'));
fs.copyFileSync(path.join(root, 'public/pwa-192x192.png'), path.join(out, 'icon.png'));
