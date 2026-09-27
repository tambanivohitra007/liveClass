// Bundles the Electron main process (lan/desktop/main.ts) into build/desktop/main.cjs.
// The LAN server itself is built separately by lan/build-server.mjs.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(root, 'lan/desktop/main.ts')],
  outfile: path.join(root, 'build/desktop/main.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: 'linked',
  external: ['electron'],
  logLevel: 'info',
});
