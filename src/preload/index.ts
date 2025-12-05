import { contextBridge, ipcRenderer } from 'electron';
import { AppConfig, AppStatus, RendererApi, UpdateState } from '../shared/types';

const api: RendererApi = {
  async getStatus() {
    return ipcRenderer.invoke('status:get') as Promise<AppStatus>;
  },
  async checkForUpdates() {
    return ipcRenderer.invoke('update:check');
  },
  async restartToUpdate() {
    return ipcRenderer.invoke('update:restart');
  },
  onUpdateState(callback: (state: UpdateState) => void) {
    ipcRenderer.on('update-state', (_event, state: UpdateState) => callback(state));
    return () => ipcRenderer.removeAllListeners('update-state');
  },
  async getConfig() {
    return ipcRenderer.invoke('config:get') as Promise<AppConfig>;
  },
  async setConfig(config: Partial<AppConfig>) {
    return ipcRenderer.invoke('config:set', config) as Promise<AppConfig>;
  },
};

contextBridge.exposeInMainWorld('api', api);

export type {};
