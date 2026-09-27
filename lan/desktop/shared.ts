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
}

export interface TitlebarColors {
  background: string;
  symbols: string;
}

export const TITLEBAR_COLORS: Record<'dark' | 'light', TitlebarColors> = {
  dark: { background: '#0b1220', symbols: '#cbd5e1' },
  light: { background: '#f8fafc', symbols: '#334155' },
};

/** API the title bar preload exposes as `window.desktop`. */
export interface DesktopBridge {
  back(): void;
  forward(): void;
  /** Opens the ⋯ menu with its top-right corner at (right, top), in window CSS pixels. */
  openMenu(right: number, top: number): void;
  copyText(text: string): void;
  onState(listener: (state: TitlebarState) => void): void;
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
