import { contextBridge, ipcRenderer } from 'electron';
import {
  AddContactRequest,
  AppConfig,
  AppStatus,
  CreateIdentityRequest,
  NostlingApi,
  NostlingRelayConfig,
  NostlingRelayEndpoint,
  RelayConfigResult,
  RendererApi,
  SendNostrMessageRequest,
  UpdateState,
} from '../shared/types';

// LEGACY: Flat API structure (will migrate to nested in GAP-007)
const legacyApi = {
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

// NEW: Nested API structure (GAP-007) - will be implemented
const api: RendererApi = {
  updates: {
    async checkNow() {
      return ipcRenderer.invoke('updates:check');
    },
    async downloadUpdate() {
      return ipcRenderer.invoke('updates:download');
    },
    async restartToUpdate() {
      return ipcRenderer.invoke('updates:restart');
    },
    onUpdateState(callback: (state: UpdateState) => void) {
      ipcRenderer.on('update-state', (_event, state: UpdateState) => callback(state));
      return () => ipcRenderer.removeAllListeners('update-state');
    },
  },
  config: {
    async get() {
      return ipcRenderer.invoke('config:get') as Promise<AppConfig>;
    },
    async set(config: Partial<AppConfig>) {
      return ipcRenderer.invoke('config:set', config) as Promise<AppConfig>;
    },
  },
  system: {
    async getStatus() {
      return ipcRenderer.invoke('system:get-status') as Promise<AppStatus>;
    },
  },
  state: {
    async get(key: string) {
      return ipcRenderer.invoke('state:get', key) as Promise<string | null>;
    },
    async set(key: string, value: string) {
      return ipcRenderer.invoke('state:set', key, value);
    },
    async delete(key: string) {
      return ipcRenderer.invoke('state:delete', key);
    },
    async getAll() {
      return ipcRenderer.invoke('state:get-all') as Promise<Record<string, string>>;
    },
  },
  nostling: {
    identities: {
      async list() {
        return ipcRenderer.invoke('nostling:identities:list') as ReturnType<NostlingApi['identities']['list']>;
      },
      async create(request: CreateIdentityRequest) {
        return ipcRenderer.invoke('nostling:identities:create', request) as ReturnType<NostlingApi['identities']['create']>;
      },
      async remove(identityId: string) {
        return ipcRenderer.invoke('nostling:identities:remove', identityId) as Promise<void>;
      },
      async updateLabel(identityId: string, label: string) {
        return ipcRenderer.invoke(
          'nostling:identities:update-label',
          identityId,
          label
        ) as ReturnType<NostlingApi['identities']['updateLabel']>;
      },
      async updateTheme(identityId: string, themeId: string) {
        return ipcRenderer.invoke('nostling:identities:update-theme', identityId, themeId) as Promise<void>;
      },
    },
    contacts: {
      async list(identityId: string) {
        return ipcRenderer.invoke('nostling:contacts:list', identityId) as ReturnType<NostlingApi['contacts']['list']>;
      },
      async add(request: AddContactRequest) {
        return ipcRenderer.invoke('nostling:contacts:add', request) as ReturnType<NostlingApi['contacts']['add']>;
      },
      async remove(contactId: string) {
        return ipcRenderer.invoke('nostling:contacts:remove', contactId) as Promise<void>;
      },
      async updateAlias(contactId: string, alias: string) {
        return ipcRenderer.invoke(
          'nostling:contacts:update-alias',
          contactId,
          alias
        ) as ReturnType<NostlingApi['contacts']['updateAlias']>;
      },
      async markConnected(contactId: string) {
        return ipcRenderer.invoke('nostling:contacts:mark-connected', contactId) as ReturnType<
          NostlingApi['contacts']['markConnected']
        >;
      },
    },
    messages: {
      async list(identityId: string, contactId: string) {
        return ipcRenderer.invoke('nostling:messages:list', identityId, contactId) as ReturnType<
          NostlingApi['messages']['list']
        >;
      },
      async send(request: SendNostrMessageRequest) {
        return ipcRenderer.invoke('nostling:messages:send', request) as ReturnType<NostlingApi['messages']['send']>;
      },
      async discardUnknown(eventId: string) {
        return ipcRenderer.invoke('nostling:messages:discard-unknown', eventId) as Promise<void>;
      },
      async retry(identityId?: string) {
        return ipcRenderer.invoke('nostling:messages:retry', identityId) as ReturnType<NostlingApi['messages']['retry']>;
      },
      async markRead(identityId: string, contactId: string) {
        return ipcRenderer.invoke('nostling:messages:mark-read', identityId, contactId) as Promise<number>;
      },
      async getUnreadCounts(identityId: string) {
        return ipcRenderer.invoke('nostling:messages:get-unread-counts', identityId) as Promise<Record<string, number>>;
      },
    },
    relays: {
      async get(identityId: string) {
        return ipcRenderer.invoke('nostling:relays:get', identityId) as Promise<NostlingRelayEndpoint[]>;
      },
      async set(identityId: string, relays: NostlingRelayEndpoint[]) {
        return ipcRenderer.invoke('nostling:relays:set', identityId, relays) as Promise<RelayConfigResult>;
      },
      async reload(identityId: string) {
        return ipcRenderer.invoke('nostling:relays:reload', identityId) as Promise<NostlingRelayEndpoint[]>;
      },
      async getStatus() {
        return ipcRenderer.invoke('nostling:relays:getStatus') as Promise<Record<string, 'connected' | 'connecting' | 'disconnected' | 'error'>>;
      },
      onStatusChange(callback: (url: string, status: string) => void) {
        const listener = (_: any, url: string, status: string) => callback(url, status);
        ipcRenderer.on('nostling:relay-status-changed', listener);
        return () => ipcRenderer.removeListener('nostling:relay-status-changed', listener);
      },
    },
    profiles: {
      onUpdated(callback: (identityId: string) => void) {
        // Register listener with main process
        ipcRenderer.send('nostling:profiles:onUpdated');
        const listener = (_: any, identityId: string) => callback(identityId);
        ipcRenderer.on('nostling:profile-updated', listener);
        return () => ipcRenderer.removeListener('nostling:profile-updated', listener);
      },
    },
  },
};

// Expose both APIs during transition
contextBridge.exposeInMainWorld('api', { ...legacyApi, ...api });

export type {};
