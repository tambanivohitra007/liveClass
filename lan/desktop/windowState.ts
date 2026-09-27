// Remembers the main window's size, position and maximized state between launches.
import { screen, type BrowserWindow, type Rectangle } from 'electron';
import fs from 'node:fs';

interface SavedState {
  bounds: Rectangle;
  maximized: boolean;
}

const DEFAULT_SIZE = { width: 1280, height: 820 };

export function loadWindowState(file: string): { bounds: Partial<Rectangle>; maximized: boolean } {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as SavedState;
    // Ignore a position on a monitor that is no longer connected.
    const display = screen.getDisplayMatching(saved.bounds);
    const area = display.workArea;
    const visible =
      saved.bounds.x < area.x + area.width &&
      saved.bounds.x + saved.bounds.width > area.x &&
      saved.bounds.y < area.y + area.height &&
      saved.bounds.y + saved.bounds.height > area.y;
    return { bounds: visible ? saved.bounds : { width: saved.bounds.width, height: saved.bounds.height }, maximized: saved.maximized };
  } catch {
    return { bounds: DEFAULT_SIZE, maximized: false };
  }
}

export function trackWindowState(win: BrowserWindow, file: string): void {
  let timer: NodeJS.Timeout | null = null;
  const save = () => {
    if (win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
    const state: SavedState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    try {
      fs.writeFileSync(file, JSON.stringify(state));
    } catch {
      // Not worth interrupting the teacher over.
    }
  };
  const later = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 500);
  };
  win.on('resize', later);
  win.on('move', later);
  win.on('maximize', save);
  win.on('unmaximize', save);
  win.on('close', save);
}
