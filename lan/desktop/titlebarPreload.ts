// Preload for the title bar page: a narrow API over IPC, nothing else.
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge, TitlebarState } from './shared';

const bridge: DesktopBridge = {
  back: () => ipcRenderer.send('titlebar:back'),
  forward: () => ipcRenderer.send('titlebar:forward'),
  openMenu: (x, y) => ipcRenderer.send('titlebar:menu', x, y),
  copyText: (text) => ipcRenderer.send('titlebar:copy', text),
  appAction: (action, right) => ipcRenderer.send('titlebar:app-action', action, right),
  onState: (listener) => {
    ipcRenderer.on('titlebar:state', (_e, state: TitlebarState) => listener(state));
  },
};

contextBridge.exposeInMainWorld('desktop', bridge);
