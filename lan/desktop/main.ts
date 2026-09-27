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
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import {
  MENU_STAYS_OPEN,
  TITLEBAR_COLORS,
  TITLEBAR_HEIGHT,
  type AppAccountState,
  type AppCommand,
  type MenuAction,
  type MenuState,
  type TitlebarAppAction,
  type TitlebarState,
} from './shared';
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
/** Transparent overlay holding the ⋯ menu; hidden while the menu is closed. */
let menuView: WebContentsView | null = null;
let menuAnchor = { right: 0, top: TITLEBAR_HEIGHT };
let menuOpenedAt = 0;
let qrSvg: string | null = null;
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
  menuOpen: false,
  account: null,
  unread: 0,
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
    qrSvg = msg.urls[0]
      ? renderToStaticMarkup(createElement(QRCodeSVG, { value: msg.urls[0], size: 176, level: 'M', marginSize: 0 }))
      : null;
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
  win.on('blur', () => {
    closeMenu();
    update({ focused: false });
  });
  const relayout = () => {
    closeMenu();
    layoutView();
  };
  win.on('resize', relayout);
  win.on('enter-full-screen', relayout);
  win.on('leave-full-screen', relayout);

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
    menuView = null;
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
    createMenuView();
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

// ---------------------------------------------------------------------------------------------
// ⋯ menu: an HTML menu (menu.html) in a transparent view stacked over the whole window, so it can
// overlap the app and match its theme. It stays loaded and is only shown and hidden.

function createMenuView(): void {
  if (!win || menuView) return;
  menuView = new WebContentsView({
    webPreferences: {
      preload: path.join(desktopDir, 'menuPreload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  menuView.setBackgroundColor('#00000000');
  menuView.setVisible(false);
  win.contentView.addChildView(menuView); // Added after the app view, so it stacks on top.
  void menuView.webContents.loadFile(path.join(desktopDir, 'menu.html'));
}

function openMenu(right: number, top: number): void {
  if (!win || !menuView) return;
  const [width, height] = win.getContentSize();
  menuAnchor = { right, top };
  menuOpenedAt = Date.now();
  menuView.setBounds({ x: 0, y: 0, width, height });
  menuView.setVisible(true);
  menuView.webContents.focus();
  sendMenu();
  update({ menuOpen: true });
}

function closeMenu(): void {
  if (!menuView || !state.menuOpen) return;
  menuView.setVisible(false);
  update({ menuOpen: false });
  view?.webContents.focus();
}

function sendMenu(): void {
  if (!menuView || !win) return;
  const menu: MenuState = {
    anchorRight: menuAnchor.right,
    anchorTop: menuAnchor.top,
    dark: state.dark,
    studentUrls: state.studentUrls,
    qrSvg,
    zoomPercent: Math.round((view?.webContents.getZoomFactor() ?? 1) * 100),
    fullScreen: win.isFullScreen(),
    version: app.getVersion(),
    openedAt: menuOpenedAt,
  };
  menuView.webContents.send('menu:show', menu);
}

function runMenuAction(action: MenuAction): void {
  const run: Record<MenuAction, () => void> = {
    'copy-address': () => ready?.urls[0] && clipboard.writeText(ready.urls[0]),
    'full-screen': actions.fullScreen,
    reload: actions.reload,
    'zoom-in': () => actions.zoom(ZOOM_STEP),
    'zoom-out': () => actions.zoom(-ZOOM_STEP),
    'zoom-reset': () => actions.zoom(0),
    help: () => void view?.webContents.executeJavaScript("window.dispatchEvent(new Event('liveclass:open-help'))"),
    'data-folder': () => void shell.openPath(dataDir),
    'server-log': () => void shell.openPath(logFile),
    'dev-tools': actions.devTools,
    about: showAbout,
    quit: () => app.quit(),
  };
  if (MENU_STAYS_OPEN.includes(action)) {
    run[action]();
    sendMenu();
  } else {
    // Close first, so full screen, dialogs and focus changes act on the app rather than the overlay.
    closeMenu();
    run[action]();
  }
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
  if (themeChanged && state.menuOpen) sendMenu();
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
  ipcMain.on('titlebar:menu', (e, right: unknown, top: unknown) => {
    if (!fromTitlebar(e)) return;
    if (state.menuOpen) closeMenu();
    else openMenu(Number(right) || 0, Number(top) || TITLEBAR_HEIGHT);
  });
  const fromMenu = (e: Electron.IpcMainEvent) => !!menuView && e.sender === menuView.webContents;
  const menuActions = new Set<string>([
    'copy-address', 'full-screen', 'reload', 'zoom-in', 'zoom-out', 'zoom-reset',
    'help', 'data-folder', 'server-log', 'dev-tools', 'about', 'quit',
  ] satisfies MenuAction[]);
  ipcMain.on('menu:run', (e, action: unknown) => {
    if (fromMenu(e) && typeof action === 'string' && menuActions.has(action)) runMenuAction(action as MenuAction);
  });
  ipcMain.on('menu:close', (e) => {
    if (fromMenu(e)) closeMenu();
  });
  // Title bar buttons that belong to the web app (theme, notifications, account): forward the click,
  // with the button's position so the app can open its panel right under it.
  const appActions = new Set<string>(['toggle-theme', 'notifications', 'account'] satisfies TitlebarAppAction[]);
  ipcMain.on('titlebar:app-action', (e, action: unknown, x: unknown) => {
    if (!fromTitlebar(e) || !win || !view || typeof action !== 'string' || !appActions.has(action)) return;
    const [width] = win.getContentSize();
    const command: AppCommand = { type: action as TitlebarAppAction, right: Math.max(0, width - (Number(x) || 0)) };
    view.webContents.send('app:command', command);
  });
  ipcMain.on('app:account', (e, account: AppAccountState) => {
    if (!view || e.sender !== view.webContents || typeof account !== 'object' || account === null) return;
    update({
      account: account.signedIn ? { initials: String(account.initials).slice(0, 3), name: String(account.name) } : null,
      unread: Math.max(0, Number(account.unread) || 0),
    });
  });
  ipcMain.on('app:theme', (e, dark: unknown) => {
    if (view && e.sender === view.webContents && typeof dark === 'boolean') update({ dark });
  });
}

// ---------------------------------------------------------------------------------------------
// Shortcuts

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
