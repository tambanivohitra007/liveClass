// Bundles the LAN server (plus the original Cloud Functions) into build/server.cjs.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shim = (p) => path.join(root, p);

const redirects = [
  [/^firebase-admin(\/.*)?$/, shim('lan/server/shims/firebase-admin.ts')],
  [/^firebase-functions(\/.*)?$/, shim('lan/server/shims/firebase-functions.ts')],
  [/^(cheerio|nodemailer)$/, shim('lan/shims-node/offline-stubs.ts')],
];

const firebaseShims = {
  name: 'firebase-shims',
  setup(b) {
    for (const [filter, target] of redirects) b.onResolve({ filter }, () => ({ path: target }));
  },
};

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: [shim('lan/server/main.ts')],
  outfile: shim('build/server.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: 'linked',
  // SEA can't load native addons; ws' optional speedups are skipped in favour of pure JS.
  external: ['bufferutil', 'utf-8-validate'],
  plugins: [firebaseShims],
  logLevel: 'info',
};

if (watch) {
  const { context } = await import('esbuild');
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
