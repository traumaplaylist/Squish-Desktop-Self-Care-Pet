import { contextBridge, ipcRenderer } from 'electron';
import { MAIN_EVENTS, RENDERER_COMMANDS, RENDERER_INVOKES, type SquishApi } from '../core/ipc';

/** Минимальный типизированный API (CLAUDE.md): только каналы из белого списка, без сырого ipcRenderer. */
const api: SquishApi = {
  invoke(channel) {
    if (!RENDERER_INVOKES.includes(channel)) return Promise.reject(new Error(`channel ${channel}`));
    return ipcRenderer.invoke(channel);
  },
  send(channel, payload) {
    if (!RENDERER_COMMANDS.includes(channel)) return;
    ipcRenderer.send(channel, payload);
  },
  on(channel, cb) {
    if (!MAIN_EVENTS.includes(channel)) return () => {};
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload as never);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('squish', api);
