// Types shared by the desktop main process and the title bar renderer.

/** Height of the custom title bar, in CSS pixels. The app view starts below it. */
export const TITLEBAR_HEIGHT = 40;

export interface TitlebarState {
  /** Page title of the app view, without the " - LiveClass" suffix. */
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Follows the web app's own light/dark theme. */
  dark: boolean;
  /** The app view is attached; until then the title bar window shows the splash screen. */
  appReady: boolean;
  /** The app view is loading a page. */
  loading: boolean;
  focused: boolean;
  /** Addresses students open on their devices. */
  studentUrls: string[];
  platform: NodeJS.Platform;
  /** The ⋯ menu is showing. */
  menuOpen: boolean;
  /** Signed-in teacher, shown as the avatar button; null when signed out. */
  account: { initials: string; name: string } | null;
  /** Unread notifications, shown on the bell. */
  unread: number;
}

export interface TitlebarColors {
  background: string;
  symbols: string;
}

export const TITLEBAR_COLORS: Record<'dark' | 'light', TitlebarColors> = {
  dark: { background: '#191919', symbols: '#d4d4d4' },
  light: { background: '#f8fafc', symbols: '#334155' },
};

/** API the title bar preload exposes as `window.desktop`. */
export interface DesktopBridge {
  back(): void;
  forward(): void;
  /** Opens the ⋯ menu with its top-right corner at (right, top), in window CSS pixels. */
  openMenu(right: number, top: number): void;
  copyText(text: string): void;
  /** Forwards a title bar button to the web app; `right` is the button's right edge, in window CSS pixels. */
  appAction(action: TitlebarAppAction, right: number): void;
  onState(listener: (state: TitlebarState) => void): void;
}

export type TitlebarAppAction = 'toggle-theme' | 'notifications' | 'account';

// Messages between the web app and the main process (app preload ↔ main). The web app's side of
// these types is src/lib/desktopBridge.ts; keep the two in sync.

/** Sent by the web app whenever the signed-in teacher or the unread count changes. */
export interface AppAccountState {
  signedIn: boolean;
  initials: string;
  name: string;
  unread: number;
}

/** Sent to the web app when a title bar button is clicked. `right` is the distance from the window's right edge. */
export interface AppCommand {
  type: TitlebarAppAction;
  right: number;
}

/** Everything the ⋯ menu (menu.html) needs to draw itself. */
export interface MenuState {
  /** Top-right corner of the menu panel, in window CSS pixels. */
  anchorRight: number;
  anchorTop: number;
  dark: boolean;
  studentUrls: string[];
  /** QR code of studentUrls[0] as an SVG string (rendered in the main process), or null offline. */
  qrSvg: string | null;
  zoomPercent: number;
  fullScreen: boolean;
  version: string;
  /** Changes each time the menu opens; updates while it is open (zoom) keep the same value. */
  openedAt: number;
}

export type MenuAction =
  | 'copy-address'
  | 'full-screen'
  | 'reload'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'help'
  | 'data-folder'
  | 'server-log'
  | 'dev-tools'
  | 'about'
  | 'quit';

/** Actions that leave the menu open: zoom (the menu is re-sent with the new level) and copy (shows "Copied"). */
export const MENU_STAYS_OPEN: readonly MenuAction[] = ['copy-address', 'zoom-in', 'zoom-out', 'zoom-reset'];

/** API the menu preload exposes as `window.desktopMenu`. */
export interface MenuBridge {
  onShow(listener: (state: MenuState) => void): void;
  run(action: MenuAction): void;
  close(): void;
}
