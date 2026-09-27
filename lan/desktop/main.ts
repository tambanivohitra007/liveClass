// LiveClass desktop app (Electron).
// Runs the LAN server (build/server.cjs) in a utility process and shows the teacher UI in a native
// window. Students still join from their own devices over Wi-Fi, exactly as with LiveClass.exe.
//
// Window layout: the BrowserWindow's own page is the custom title bar (titlebar.html, which also shows
// the splash screen); the web app runs in a WebContentsView placed below the bar. Keeping the app in
// its own view means full-height pages (100dvh, fixed overlays) need no changes for the title bar.
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  shell,
  Tray,
  utilityProcess,
  WebContentsView,
  type MenuItemConstructorOptions,
  type UtilityProcess,
  type WebContents,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { TITLEBAR_COLORS, TITLEBAR_HEIGHT, type TitlebarState } from './shared';
import { loadWindowState, trackWindowState } from './windowState';

interface ReadyMessage {
  type: 'ready';
  port: number;
  urls: string[];
  dataDir: string;
}

const SHUTDOWN_TIMEOUT_MS = 5000;
const ZOOM_STEP = 0.5;

/** Floating, slimmer scrollbars in the desktop window (the app's own theme colours are kept). */
const DESKTOP_CSS = `
  ::-webkit-scrollbar { width: 12px; height: 12px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    border: 3px solid transparent;
    border-radius: 12px;
    background-clip: padding-box;
  }
`;

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
const desktopDir = path.join(root, 'build', 'desktop');
const dataDir = process.env.LIVECLASS_DATA ? path.resolve(process.env.LIVECLASS_DATA) : paths.data;
const logFile = path.join(app.getPath('userData'), 'logs', 'server.log');
const windowStateFile = path.join(app.getPath('userData'), 'window-state.json');

let server: UtilityProcess | null = null;
let ready: ReadyMessage | null = null;
let win: BrowserWindow | null = null;
let view: WebContentsView | null = null;
let tray: Tray | null = null;
let quitting = false;

const state: TitlebarState = {
  title: '',
  canGoBack: false,
  canGoForward: false,
  dark: nativeTheme.shouldUseDarkColors,
  appReady: false,
  loading: true,
  focused: true,
  studentUrls: [],
  platform: process.platform,
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(start);
}

function start(): void {
  // Lets the web client recognise the desktop app (isDesktopApp in src/lib/platform.ts).
  app.userAgentFallback = `${app.userAgentFallback} LiveClassDesktop/${app.getVersion()}`;
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
  startServer();
}

// ---------------------------------------------------------------------------------------------
// Server

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
    update({ studentUrls: msg.urls });
    createTray();
    void createAppView();
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

// ---------------------------------------------------------------------------------------------
// Window

function createWindow(): void {
  const saved = loadWindowState(windowStateFile);
  const colors = TITLEBAR_COLORS[state.dark ? 'dark' : 'light'];

  win = new BrowserWindow({
    ...saved.bounds,
    minWidth: 960,
    minHeight: 600,
    title: 'LiveClass',
    icon: paths.icon,
    show: false,
    backgroundColor: colors.background,
    // Native frame without the native title bar: keeps Windows 11 rounded corners, shadow and Snap Layouts.
    titleBarStyle: 'hidden',
    // One pixel shorter than the bar so its bottom hairline runs under the window buttons too.
    titleBarOverlay: { color: colors.background, symbolColor: colors.symbols, height: TITLEBAR_HEIGHT - 1 },
    webPreferences: {
      preload: path.join(desktopDir, 'titlebarPreload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  trackWindowState(win, windowStateFile);
  win.once('ready-to-show', () => {
    if (saved.maximized) win?.maximize();
    win?.show();
  });
  win.webContents.on('did-finish-load', () => sendState());
  void win.loadFile(path.join(desktopDir, 'titlebar.html'));

  win.on('focus', () => update({ focused: true }));
  win.on('blur', () => update({ focused: false }));
  win.on('resize', layoutView);
  win.on('enter-full-screen', layoutView);
  win.on('leave-full-screen', layoutView);

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
    view = null;
  });
}

async function createAppView(): Promise<void> {
  if (!win || view) return;
  view = new WebContentsView({
    webPreferences: {
      preload: path.join(desktopDir, 'appPreload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const wc = view.webContents;
  view.setBackgroundColor(TITLEBAR_COLORS[state.dark ? 'dark' : 'light'].background);
  keepInsideApp(wc);
  handleShortcuts(wc);
  wc.on('dom-ready', () => void wc.insertCSS(DESKTOP_CSS));

  const syncNavigation = () =>
    update({ canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() });
  wc.on('did-navigate', syncNavigation);
  wc.on('did-navigate-in-page', syncNavigation);
  wc.on('did-start-loading', () => update({ loading: true }));
  wc.on('did-stop-loading', () => update({ loading: false }));
  wc.on('page-title-updated', (_e, title) => {
    const clean = title.replace(/\s*[-|–]\s*LiveClass$/, '').replace(/^LiveClass$/, '');
    update({ title: clean });
    win?.setTitle(clean ? `${clean} - LiveClass` : 'LiveClass');
  });
  // Attach once the first page has painted, so the splash hands over without a white flash.
  wc.once('did-finish-load', () => {
    if (!win || !view) return;
    win.contentView.addChildView(view);
    layoutView();
    update({ appReady: true });
  });

  await wc.loadURL(await firstPage());
}

/** The app view fills the window below the title bar (or all of it in full screen, where the bar is hidden). */
function layoutView(): void {
  if (!win || !view) return;
  const [width, height] = win.getContentSize();
  const top = win.isFullScreen() ? 0 : TITLEBAR_HEIGHT;
  view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
}

function showWindow(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Same-origin pages (e.g. a projector view) open as app windows; everything else goes to the browser. */
function keepInsideApp(wc: WebContents): void {
  const isLocal = (url: string) => !!ready && (url.startsWith(localUrl() + '/') || url === localUrl());
  wc.setWindowOpenHandler(({ url }) => {
    if (isLocal(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          icon: paths.icon,
          autoHideMenuBar: true,
          backgroundColor: TITLEBAR_COLORS[state.dark ? 'dark' : 'light'].background,
        },
      };
    }
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (isLocal(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });
  wc.on('did-create-window', (child) => keepInsideApp(child.webContents));
}

// ---------------------------------------------------------------------------------------------
// Title bar state

function update(patch: Partial<TitlebarState>): void {
  const themeChanged = patch.dark !== undefined && patch.dark !== state.dark;
  Object.assign(state, patch);
  if (themeChanged) applyTheme();
  sendState();
}

function sendState(): void {
  if (win && !win.isDestroyed()) win.webContents.send('titlebar:state', state);
}

function applyTheme(): void {
  const colors = TITLEBAR_COLORS[state.dark ? 'dark' : 'light'];
  if (!win || win.isDestroyed()) return;
  win.setBackgroundColor(colors.background);
  win.setTitleBarOverlay({ color: colors.background, symbolColor: colors.symbols, height: TITLEBAR_HEIGHT - 1 });
  view?.setBackgroundColor(colors.background);
}

function registerIpc(): void {
  const fromTitlebar = (e: Electron.IpcMainEvent) => !!win && e.sender === win.webContents;
  ipcMain.on('titlebar:back', (e) => {
    if (fromTitlebar(e)) view?.webContents.navigationHistory.goBack();
  });
  ipcMain.on('titlebar:forward', (e) => {
    if (fromTitlebar(e)) view?.webContents.navigationHistory.goForward();
  });
  ipcMain.on('titlebar:copy', (e, text: unknown) => {
    if (fromTitlebar(e) && typeof text === 'string') clipboard.writeText(text);
  });
  ipcMain.on('titlebar:menu', (e, x: unknown, y: unknown) => {
    if (!fromTitlebar(e) || !win) return;
    appMenu().popup({ window: win, x: Number(x) || 0, y: Number(y) || TITLEBAR_HEIGHT });
  });
  ipcMain.on('app:theme', (e, dark: unknown) => {
    if (view && e.sender === view.webContents && typeof dark === 'boolean') update({ dark });
  });
}

// ---------------------------------------------------------------------------------------------
// Menu and shortcuts

const actions = {
  reload: () => view?.webContents.reload(),
  hardReload: () => view?.webContents.reloadIgnoringCache(),
  back: () => view?.webContents.navigationHistory.goBack(),
  forward: () => view?.webContents.navigationHistory.goForward(),
  zoom: (delta: number) => {
    const wc = view?.webContents;
    if (wc) wc.setZoomLevel(delta === 0 ? 0 : wc.getZoomLevel() + delta);
  },
  fullScreen: () => win?.setFullScreen(!win.isFullScreen()),
  devTools: () => view?.webContents.toggleDevTools(),
};

function appMenu(): Menu {
  // Accelerators here are labels only; handleShortcuts() does the work so they reach the app view.
  const item = (label: string, accelerator: string, click: () => void): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click,
  });
  return Menu.buildFromTemplate([
    ...studentAddressItems(),
    { type: 'separator' },
    item('Reload', 'Ctrl+R', actions.reload),
    item('Full screen', 'F11', actions.fullScreen),
    {
      label: 'Zoom',
      submenu: [
        item('Zoom in', 'Ctrl+=', () => actions.zoom(ZOOM_STEP)),
        item('Zoom out', 'Ctrl+-', () => actions.zoom(-ZOOM_STEP)),
        item('Actual size', 'Ctrl+0', () => actions.zoom(0)),
      ],
    },
    { type: 'separator' },
    { label: 'Open data folder', click: () => void shell.openPath(dataDir) },
    { label: 'Show server log', click: () => void shell.openPath(logFile) },
    item('Developer tools', 'Ctrl+Shift+I', actions.devTools),
    { type: 'separator' },
    { label: 'About LiveClass', click: showAbout },
    { label: 'Quit LiveClass', click: () => app.quit() },
  ]);
}

function handleShortcuts(wc: WebContents): void {
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key;
    let action: (() => void) | null = null;

    if (key === 'F5' || (ctrl && !input.shift && key.toLowerCase() === 'r')) action = actions.reload;
    else if (ctrl && input.shift && key.toLowerCase() === 'r') action = actions.hardReload;
    else if (key === 'F11') action = actions.fullScreen;
    else if (key === 'F12' || (ctrl && input.shift && key.toLowerCase() === 'i')) action = actions.devTools;
    else if (ctrl && (key === '=' || key === '+')) action = () => actions.zoom(ZOOM_STEP);
    else if (ctrl && key === '-') action = () => actions.zoom(-ZOOM_STEP);
    else if (ctrl && key === '0') action = () => actions.zoom(0);
    else if (input.alt && key === 'ArrowLeft') action = actions.back;
    else if (input.alt && key === 'ArrowRight') action = actions.forward;

    if (action) {
      e.preventDefault();
      action();
    }
  });
}

function showAbout(): void {
  if (!win) return;
  void dialog.showMessageBox(win, {
    type: 'info',
    title: 'About LiveClass',
    message: `LiveClass ${app.getVersion()}`,
    detail:
      'Offline classroom quizzes and games.\n\n' +
      `Data folder: ${dataDir}\n` +
      (ready?.urls.length ? `Student address: ${ready.urls.join(', ')}` : 'No Wi-Fi network found.'),
    icon: nativeImage.createFromPath(paths.icon).resize({ width: 64, height: 64 }),
    noLink: true,
  });
}

// ---------------------------------------------------------------------------------------------
// Tray

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

function studentAddressItems(): MenuItemConstructorOptions[] {
  if (!ready?.urls.length) return [{ label: 'No Wi-Fi network found', enabled: false }];
  return ready.urls.map((url) => ({
    label: `Copy student address  ${url}`,
    click: () => clipboard.writeText(url),
  }));
}

// ---------------------------------------------------------------------------------------------
// Lifecycle

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
