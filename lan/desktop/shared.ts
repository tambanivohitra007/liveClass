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
  openMenu(x: number, y: number): void;
  copyText(text: string): void;
  onState(listener: (state: TitlebarState) => void): void;
}
