// Preload for the LiveClass web app view.
// - Reports the app's light/dark theme (the `dark` class on <html>) so the title bar can match it.
// - Exposes `window.liveclassDesktop` (see src/lib/desktopBridge.ts): the app reports the signed-in
//   teacher and unread count for the title bar, and receives the title bar's button clicks.
import { contextBridge, ipcRenderer } from 'electron';
import type { AppAccountState, AppCommand } from './shared';

let last: boolean | null = null;
const report = () => {
  const dark = document.documentElement.classList.contains('dark');
  if (dark === last) return;
  last = dark;
  ipcRenderer.send('app:theme', dark);
};

window.addEventListener('DOMContentLoaded', () => {
  report();
  new MutationObserver(report).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});

contextBridge.exposeInMainWorld('liveclassDesktop', {
  reportAccount: (account: AppAccountState) => ipcRenderer.send('app:account', account),
  onCommand: (listener: (command: AppCommand) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, command: AppCommand) => listener(command);
    ipcRenderer.on('app:command', handler);
    return () => {
      ipcRenderer.removeListener('app:command', handler);
    };
  },
});
