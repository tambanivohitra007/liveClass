// The web app's side of the desktop title bar bridge (exposed by lan/desktop/appPreload.ts).
// Keep these types in sync with AppAccountState / AppCommand in lan/desktop/shared.ts.

export interface DesktopAccountState {
  signedIn: boolean;
  initials: string;
  name: string;
  unread: number;
}

export interface DesktopCommand {
  type: 'toggle-theme' | 'notifications' | 'account';
  /** Right edge of the title bar button that was clicked, as a distance from the window's right edge. */
  right: number;
}

interface DesktopBridge {
  reportAccount(account: DesktopAccountState): void;
  /** Returns an unsubscribe function. */
  onCommand(listener: (command: DesktopCommand) => void): () => void;
}

/** The bridge, or undefined outside the desktop app. */
export function desktopBridge(): DesktopBridge | undefined {
  return (window as Window & { liveclassDesktop?: DesktopBridge }).liveclassDesktop;
}
