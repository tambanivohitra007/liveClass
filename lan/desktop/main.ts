// LiveClass desktop app (Electron).
// Runs the LAN server (build/server.cjs) in a utility process and shows the teacher UI in a native
// window. Students still join from their own devices over Wi-Fi, exactly as with LiveClass.exe.
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  nativeImage,
  shell,
  Tray,
  utilityProcess,
  type UtilityProcess,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';

interface ReadyMessage {
  type: 'ready';
  port: number;
  urls: string[];
  dataDir: string;
}

const SHUTDOWN_TIMEOUT_MS = 5000;

// %APPDATA%\LiveClass for the installed app (not the npm package name); a separate folder in development.
// Must run before anything reads userData, including the single-instance lock.
app.setPath('userData', path.join(app.getPath('appData'), app.isPackaged ? 'LiveClass' : 'LiveClass-dev'));

// Packaged: files live in resources/ (see electron-builder.yml). Development: the repo's build outputs.
const root = app.getAppPath();
const paths = app.isPackaged
  ? {
      server: path.join(process.resourcesPath, 'server', 'server.cjs'),
      web: path.join(process.resourcesPath, 'web'),
      icon: path.join(process.resourcesPath, 'icon.png'),
      data: path.join(app.getPath('userData'), 'liveclass-data'),
    }
  : {
      server: path.join(root, 'build', 'server.cjs'),
      web: path.join(root, 'dist'),
      icon: path.join(root, 'public', 'pwa-512x512.png'),
      data: path.join(root, 'liveclass-data'),
    };
const dataDir = process.env.LIVECLASS_DATA ? path.resolve(process.env.LIVECLASS_DATA) : paths.data;
const logFile = path.join(app.getPath('userData'), 'logs', 'server.log');

let server: UtilityProcess | null = null;
let ready: ReadyMessage | null = null;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(start);
}

function start(): void {
  Menu.setApplicationMenu(buildMenu());
  startServer();
}

function startServer(): void {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = fs.createWriteStream(logFile, { flags: 'a' });
  log.write(`\n--- ${new Date().toISOString()} starting LiveClass ${app.getVersion()} ---\n`);

  server = utilityProcess.fork(paths.server, [], {
    serviceName: 'LiveClass server',
    stdio: 'pipe',
    env: {
      ...process.env,
      LIVECLASS_DATA: dataDir,
      LIVECLASS_WEB: paths.web,
      LIVECLASS_NO_BROWSER: '1',
    },
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);

  server.on('message', (msg: ReadyMessage) => {
    if (msg?.type !== 'ready') return;
    ready = msg;
    createTray();
    showWindow();
  });

  server.on('exit', (code) => {
    server = null;
    if (quitting) {
      app.quit();
      return;
    }
    dialog.showErrorBox(
      'LiveClass stopped',
      `The LiveClass server stopped unexpectedly (code ${code}).\n\n` +
        `Your saved data is in:\n${dataDir}\n\nDetails are in the log:\n${logFile}`,
    );
    app.exit(1);
  });
}

function localUrl(): string {
  return `http://localhost:${ready!.port}`;
}

function showWindow(): void {
  if (!ready) return;
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'LiveClass',
    icon: paths.icon,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.once('ready-to-show', () => win?.show());
  keepInsideApp(win);
  void firstPage().then((url) => win?.loadURL(url));

  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(win!, {
      type: 'question',
      title: 'Close LiveClass',
      message: 'Quit LiveClass?',
      detail:
        'Students will be disconnected from any running game.\n\n' +
        'Choose "Keep running" to hide this window and keep the class going; ' +
        'reopen it from the LiveClass icon in the taskbar tray.',
      buttons: ['Quit', 'Keep running', 'Cancel'],
      defaultId: 2,
      cancelId: 2,
      noLink: true,
    });
    if (choice === 0) app.quit();
    else if (choice === 1) win?.hide();
  });
  win.on('closed', () => {
    win = null;
  });
}

/** This window belongs to the teacher: on a fresh install, go straight to creating the administrator account. */
async function firstPage(): Promise<string> {
  try {
    const config = (await (await fetch(`${localUrl()}/api/config`)).json()) as { needsSetup?: boolean };
    if (config.needsSetup) return `${localUrl()}/signup`;
  } catch {
    // Fall through to the home page, which links to sign-in.
  }
  return localUrl();
}

/** Same-origin pages (e.g. a projector view) open as app windows; everything else goes to the browser. */
function keepInsideApp(w: BrowserWindow): void {
  const isLocal = (url: string) => url.startsWith(localUrl() + '/') || url === localUrl();
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocal(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { icon: paths.icon, autoHideMenuBar: true, backgroundColor: '#0f172a' },
      };
    }
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => {
    if (isLocal(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });
  w.webContents.on('did-create-window', (child) => keepInsideApp(child));
}

function createTray(): void {
  if (tray) return;
  tray = new Tray(nativeImage.createFromPath(paths.icon).resize({ width: 16, height: 16 }));
  tray.setToolTip('LiveClass');
  tray.on('click', () => showWindow());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open LiveClass', click: () => showWindow() },
      { type: 'separator' },
      ...studentAddressItems(),
      { type: 'separator' },
      { label: 'Open data folder', click: () => void shell.openPath(dataDir) },
      { label: 'Quit LiveClass', click: () => app.quit() },
    ]),
  );
}

function studentAddressItems(): Electron.MenuItemConstructorOptions[] {
  if (!ready?.urls.length) return [{ label: 'No Wi-Fi network found', enabled: false }];
  return ready.urls.map((url) => ({
    label: `Copy student address  ${url}`,
    click: () => clipboard.writeText(url),
  }));
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    { role: 'fileMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Open data folder', click: () => void shell.openPath(dataDir) },
        { label: 'Show server log', click: () => void shell.openPath(logFile) },
      ],
    },
  ]);
}

// Let the server save its data before the app exits.
app.on('before-quit', (e) => {
  quitting = true;
  if (!server) return;
  e.preventDefault();
  server.postMessage({ type: 'shutdown' });
  setTimeout(() => {
    server?.kill();
    app.exit(0);
  }, SHUTDOWN_TIMEOUT_MS).unref();
});

// With the window hidden the tray keeps the app alive; never quit just because windows closed.
app.on('window-all-closed', () => {
  if (quitting) app.quit();
});
