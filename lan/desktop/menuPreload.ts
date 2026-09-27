// Preload for the ⋯ menu overlay: a narrow API over IPC, nothing else.
import { contextBridge, ipcRenderer } from 'electron';
import type { MenuAction, MenuBridge, MenuState } from './shared';

const bridge: MenuBridge = {
  onShow: (listener) => {
    ipcRenderer.on('menu:show', (_e, state: MenuState) => listener(state));
  },
  run: (action: MenuAction) => ipcRenderer.send('menu:run', action),
  close: () => ipcRenderer.send('menu:close'),
};

contextBridge.exposeInMainWorld('desktopMenu', bridge);
