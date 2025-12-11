/**
 * GAP-007: Nested IPC API handlers
 *
 * This module registers all IPC handlers with domain-based organization.
 * Replaces flat API structure with nested domains: updates, config, system.
 */

import { ipcMain, BrowserWindow } from 'electron';
import {
  AddContactRequest,
  AppConfig,
  AppStatus,
  CreateIdentityRequest,
  NostlingRelayConfig,
  SendNostrMessageRequest,
  UpdateState,
} from '../../shared/types';

interface NostlingIpcDependencies {
  listIdentities: () => Promise<any>;
  createIdentity: (request: CreateIdentityRequest) => Promise<any>;
  removeIdentity: (identityId: string) => Promise<void>;
  listContacts: (identityId: string) => Promise<any>;
  addContact: (request: AddContactRequest) => Promise<any>;
  removeContact: (contactId: string) => Promise<void>;
  markContactConnected: (contactId: string) => Promise<any>;
  listMessages: (identityId: string, contactId: string) => Promise<any>;
  sendMessage: (request: SendNostrMessageRequest) => Promise<any>;
  discardUnknown: (eventId: string) => Promise<void>;
  getRelayConfig: () => Promise<NostlingRelayConfig>;
  setRelayConfig: (config: NostlingRelayConfig) => Promise<NostlingRelayConfig>;
}

/**
 * Register all IPC handlers with domain prefixes
 *
 * CONTRACT:
 *   Inputs:
 *     - dependencies: object containing:
 *       - getStatus: function returning Promise<AppStatus>
 *       - checkForUpdates: function returning Promise<void>
 *       - downloadUpdate: function returning Promise<void>
 *       - restartToUpdate: function returning Promise<void>
 *       - getConfig: function returning Promise<AppConfig>
 *       - setConfig: function accepting Partial<AppConfig>, returning Promise<AppConfig>
 *
 *   Outputs:
 *     - void (side effect: registers IPC handlers)
 *
 *   Invariants:
 *     - All handlers use domain:action naming pattern
 *     - Handlers registered with ipcMain.handle (async invoke pattern)
 *     - Domain prefixes: 'updates:', 'config:', 'system:', 'state:'
 *
 *   Properties:
 *     - Completeness: all RendererApi methods have corresponding handlers
 *     - Consistency: channel names match TypeScript type definitions
 *     - Idempotent: calling multiple times re-registers handlers (last wins)
 *
 *   Algorithm:
 *     1. Register system domain handlers:
 *        - 'system:get-status' → calls dependencies.getStatus()
 *     2. Register updates domain handlers:
 *        - 'updates:check' → calls dependencies.checkForUpdates()
 *        - 'updates:download' → calls dependencies.downloadUpdate()
 *        - 'updates:restart' → calls dependencies.restartToUpdate()
 *     3. Register config domain handlers:
 *        - 'config:get' → calls dependencies.getConfig()
 *        - 'config:set' → calls dependencies.setConfig(config)
 *
 *   Channel Naming:
 *     - system:get-status (not status:get - matches nested API)
 *     - updates:check (not update:check)
 *     - updates:download (new for GAP-005)
 *     - updates:restart
 *     - config:get
 *     - config:set
 *     - state:get
 *     - state:set
 *     - state:delete
 *     - state:get-all
 */
export function registerHandlers(dependencies: {
  getStatus: () => Promise<AppStatus>;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  restartToUpdate: () => Promise<void>;
  getConfig: () => Promise<AppConfig>;
  setConfig: (config: Partial<AppConfig>) => Promise<AppConfig>;
  // State domain handlers (persistence layer)
  getState: (key: string) => Promise<string | null>;
  setState: (key: string, value: string) => Promise<void>;
  deleteState: (key: string) => Promise<void>;
  getAllState: () => Promise<Record<string, string>>;
  nostling?: NostlingIpcDependencies;
}): void {
  // System domain: status queries
  ipcMain.handle('system:get-status', async () => {
    return dependencies.getStatus();
  });

  // Updates domain: check, download, and restart
  ipcMain.handle('updates:check', async () => {
    return dependencies.checkForUpdates();
  });

  ipcMain.handle('updates:download', async () => {
    return dependencies.downloadUpdate();
  });

  ipcMain.handle('updates:restart', async () => {
    return dependencies.restartToUpdate();
  });

  // Config domain: get and set
  ipcMain.handle('config:get', async () => {
    return dependencies.getConfig();
  });

  ipcMain.handle('config:set', async (_, config: Partial<AppConfig>) => {
    return dependencies.setConfig(config);
  });

  // State domain: persistent key-value storage
  ipcMain.handle('state:get', async (_, key: string) => {
    return dependencies.getState(key);
  });

  ipcMain.handle('state:set', async (_, key: string, value: string) => {
    return dependencies.setState(key, value);
  });

  ipcMain.handle('state:delete', async (_, key: string) => {
    return dependencies.deleteState(key);
  });

  ipcMain.handle('state:get-all', async () => {
    return dependencies.getAllState();
  });

  // Nostling domain: identities, contacts, messages, relay config
  if (dependencies.nostling) {
    // Identities
    ipcMain.handle('nostling:identities:list', async () => dependencies.nostling!.listIdentities());
    ipcMain.handle('nostling:identities:create', async (_, request: CreateIdentityRequest) =>
      dependencies.nostling!.createIdentity(request)
    );
    ipcMain.handle('nostling:identities:remove', async (_, identityId: string) =>
      dependencies.nostling!.removeIdentity(identityId)
    );

    // Contacts
    ipcMain.handle('nostling:contacts:list', async (_, identityId: string) =>
      dependencies.nostling!.listContacts(identityId)
    );
    ipcMain.handle('nostling:contacts:add', async (_, request: AddContactRequest) =>
      dependencies.nostling!.addContact(request)
    );
    ipcMain.handle('nostling:contacts:remove', async (_, contactId: string) =>
      dependencies.nostling!.removeContact(contactId)
    );
    ipcMain.handle('nostling:contacts:mark-connected', async (_, contactId: string) =>
      dependencies.nostling!.markContactConnected(contactId)
    );

    // Messages
    ipcMain.handle('nostling:messages:list', async (_, identityId: string, contactId: string) =>
      dependencies.nostling!.listMessages(identityId, contactId)
    );
    ipcMain.handle('nostling:messages:send', async (_, request: SendNostrMessageRequest) =>
      dependencies.nostling!.sendMessage(request)
    );
    ipcMain.handle('nostling:messages:discard-unknown', async (_, eventId: string) =>
      dependencies.nostling!.discardUnknown(eventId)
    );

    // Relay configuration
    ipcMain.handle('nostling:relays:get', async () => dependencies.nostling!.getRelayConfig());
    ipcMain.handle('nostling:relays:set', async (_, config: NostlingRelayConfig) =>
      dependencies.nostling!.setRelayConfig(config)
    );
  }

  // BUG FIX: Legacy IPC handlers for backward compatibility
  // Root cause: E2E tests using old API channel names (status:get, update:check, update:restart)
  // Bug report: bug-reports/e2e-legacy-ipc-handlers.md
  // Date: 2025-12-06
  ipcMain.handle('status:get', async () => {
    return dependencies.getStatus();
  });

  ipcMain.handle('update:check', async () => {
    return dependencies.checkForUpdates();
  });

  ipcMain.handle('update:restart', async () => {
    return dependencies.restartToUpdate();
  });
}

/**
 * Broadcast update state to all renderer windows
 *
 * CONTRACT:
 *   Inputs:
 *     - updateState: UpdateState object with phase, version, detail, progress
 *     - windows: array of BrowserWindow instances
 *
 *   Outputs:
 *     - void (side effect: sends IPC message to renderers)
 *
 *   Invariants:
 *     - Message sent to all windows
 *     - Channel name: 'update-state'
 *     - No response expected (one-way broadcast)
 *
 *   Properties:
 *     - Broadcast: all windows receive identical message
 *     - Non-blocking: does not wait for renderer acknowledgment
 *
 *   Algorithm:
 *     1. For each window in windows:
 *        a. If window exists and not destroyed:
 *           - Call window.webContents.send('update-state', updateState)
 *     2. Return (no waiting)
 */
export function broadcastUpdateState(
  updateState: UpdateState,
  windows: BrowserWindow[]
): void {
  for (const window of windows) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('update-state', updateState);
    }
  }
}
