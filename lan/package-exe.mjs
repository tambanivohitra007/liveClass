// Packages the LAN server + built web client into a single Windows executable (Node SEA):
//   release/LiveClass.exe  — double-click to run, no Node.js or internet needed.
// Prerequisite: `npm run build` (creates dist/ and build/server.cjs). `npm run package:exe` does both.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = (...p) => path.join(root, ...p);
const outDir = r('release');
const exeName = process.platform === 'win32' ? 'LiveClass.exe' : 'LiveClass';
const exe = path.join(outDir, exeName);

for (const need of ['dist/index.html', 'build/server.cjs']) {
  if (!fs.existsSync(r(need))) throw new Error(`Missing ${need} — run "npm run build" first.`);
}

// 1. Every file of the web client becomes an embedded asset, keyed "web/<url path>".
const assets = {};
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else assets['web/' + path.relative(r('dist'), full).split(path.sep).join('/')] = full;
  }
};
walk(r('dist'));

fs.mkdirSync(r('build'), { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
const seaConfig = {
  main: r('build/server.cjs'),
  output: r('build/sea-prep.blob'),
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: true,
  assets,
};
fs.writeFileSync(r('build/sea-config.json'), JSON.stringify(seaConfig, null, 2));
console.log(`Embedding ${Object.keys(assets).length} web files…`);
execFileSync(process.execPath, ['--experimental-sea-config', r('build/sea-config.json')], { stdio: 'inherit' });

// 2. Start from a copy of this Node binary.
fs.rmSync(exe, { force: true });
fs.copyFileSync(process.execPath, exe);

// 3. Windows: icon + version info (must happen before the blob is injected).
if (process.platform === 'win32') {
  const png = fs.readFileSync(r('public/pwa-192x192.png'));
  // Minimal .ico wrapping the PNG (supported since Windows Vista).
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(192, 6);
  header.writeUInt8(192, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  const ico = r('build/liveclass.ico');
  fs.writeFileSync(ico, Buffer.concat([header, png]));
  try {
    const { rcedit } = await import('rcedit');
    const version = JSON.parse(fs.readFileSync(r('package.json'), 'utf8')).version || '1.0.0';
    await rcedit(exe, {
      icon: ico,
      'product-version': version,
      'file-version': version,
      'version-string': {
        ProductName: 'LiveClass',
        FileDescription: 'LiveClass — offline classroom games',
        CompanyName: 'LiveClass',
        OriginalFilename: exeName,
        InternalName: 'LiveClass',
        LegalCopyright: '',
      },
    });
  } catch (err) {
    console.warn('Could not set the icon (continuing):', err.message);
  }
}

// 4. Inject the application blob.
const postject = r('node_modules/postject/dist/cli.js');
const args = [postject, exe, 'NODE_SEA_BLOB', r('build/sea-prep.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', '--overwrite'];
if (process.platform === 'darwin') args.push('--macho-segment-name', 'NODE_SEA');
execFileSync(process.execPath, args, { stdio: 'inherit' });

// 5. Teacher-facing instructions next to the exe.
fs.copyFileSync(r('lan/README-teachers.txt'), path.join(outDir, 'README.txt'));

const mb = (fs.statSync(exe).size / 1024 / 1024).toFixed(1);
console.log(`\n✔ ${path.relative(root, exe)} (${mb} MB)`);
