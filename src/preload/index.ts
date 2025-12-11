import { contextBridge, ipcRenderer } from 'electron';
import {
  AddContactRequest,
  AppConfig,
  AppStatus,
  CreateIdentityRequest,
  NostlingApi,
  NostlingRelayConfig,
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
        return ipcRenderer.invoke('nostling:identities:list') as Promise<Awaited<NostlingApi['identities']['list']>>;
      },
      async create(request: CreateIdentityRequest) {
        return ipcRenderer.invoke('nostling:identities:create', request) as Promise<Awaited<NostlingApi['identities']['create']>>;
      },
      async remove(identityId: string) {
        return ipcRenderer.invoke('nostling:identities:remove', identityId) as Promise<void>;
      },
    },
    contacts: {
      async list(identityId: string) {
        return ipcRenderer.invoke('nostling:contacts:list', identityId) as Promise<Awaited<NostlingApi['contacts']['list']>>;
      },
      async add(request: AddContactRequest) {
        return ipcRenderer.invoke('nostling:contacts:add', request) as Promise<Awaited<NostlingApi['contacts']['add']>>;
      },
      async remove(contactId: string) {
        return ipcRenderer.invoke('nostling:contacts:remove', contactId) as Promise<void>;
      },
      async markConnected(contactId: string) {
        return ipcRenderer.invoke('nostling:contacts:mark-connected', contactId) as Promise<
          Awaited<NostlingApi['contacts']['markConnected']>
        >;
      },
    },
    messages: {
      async list(identityId: string, contactId: string) {
        return ipcRenderer.invoke('nostling:messages:list', identityId, contactId) as Promise<
          Awaited<NostlingApi['messages']['list']>
        >;
      },
      async send(request: SendNostrMessageRequest) {
        return ipcRenderer.invoke('nostling:messages:send', request) as Promise<Awaited<NostlingApi['messages']['send']>>;
      },
      async discardUnknown(eventId: string) {
        return ipcRenderer.invoke('nostling:messages:discard-unknown', eventId) as Promise<void>;
      },
    },
    relays: {
      async get() {
        return ipcRenderer.invoke('nostling:relays:get') as Promise<NostlingRelayConfig>;
      },
      async set(config: NostlingRelayConfig) {
        return ipcRenderer.invoke('nostling:relays:set', config) as Promise<NostlingRelayConfig>;
      },
    },
  },
};

// Expose both APIs during transition
contextBridge.exposeInMainWorld('api', { ...legacyApi, ...api });

export type {};
