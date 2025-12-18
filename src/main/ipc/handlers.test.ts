/**
 * Property-based tests for handlers.ts
 *
 * Tests verify all contract invariants and properties of broadcastUpdateState:
 * - Completeness: all active windows receive message
 * - Safety: destroyed windows skipped without error
 * - Emptiness: handles empty window lists gracefully
 * - Channel correctness: uses 'update-state' channel
 * - State preservation: state object passed unchanged
 * - Isolation: multiple windows each get their own copy
 * - Non-blocking: returns immediately
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import {
  UpdateState,
  AppStatus,
  AppConfig,
  NostlingIdentity,
  NostlingContact,
  NostlingMessage,
  NostlingRelayConfig,
  NostlingRelayEndpoint,
  RelayConfigConflict,
  CreateIdentityRequest,
} from '../../shared/types';
import { SecretDecryptionError, SecureStorageUnavailableError } from '../nostling/secret-store';

// Mock electron before importing handlers
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
  },
  app: {},
  BrowserWindow: {},
}));

import { broadcastUpdateState, registerHandlers } from './handlers';

/**
 * Mock webContents for capturing sent messages
 */
interface MockWebContents {
  send: ReturnType<typeof jest.fn>;
}

/**
 * Mock BrowserWindow with controllable state
 */
interface MockWindow {
  webContents: MockWebContents;
  _isDestroyed: boolean;
  isDestroyed: ReturnType<typeof jest.fn>;
}

/**
 * Create a mock window that tracks sent messages
 */
function createMockWindow(isDestroyed = false): MockWindow {
  const mockWebContents: MockWebContents = {
    send: jest.fn(),
  };

  const mockWindow: MockWindow = {
    webContents: mockWebContents,
    _isDestroyed: isDestroyed,
    isDestroyed: jest.fn(() => mockWindow._isDestroyed),
  };

  return mockWindow;
}

/**
 * Fast-check arbitrary for UpdatePhase
 */
const updatePhaseArbitrary = fc.oneof(
  fc.constant('idle' as const),
  fc.constant('checking' as const),
  fc.constant('available' as const),
  fc.constant('downloading' as const),
  fc.constant('downloaded' as const),
  fc.constant('verifying' as const),
  fc.constant('ready' as const),
  fc.constant('failed' as const)
);

/**
 * Fast-check arbitrary for DownloadProgress
 */
const downloadProgressArbitrary = fc.record({
  percent: fc.integer({ min: 0, max: 100 }),
  bytesPerSecond: fc.nat(),
  transferred: fc.nat(),
  total: fc.nat(),
});

/**
 * Fast-check arbitrary for UpdateState
 */
const updateStateArbitrary: fc.Arbitrary<UpdateState> = fc.record({
  phase: updatePhaseArbitrary,
  detail: fc.oneof(fc.constant(undefined), fc.string()),
  version: fc.oneof(fc.constant(undefined), fc.stringMatching(/^\d+\.\d+\.\d+$/)),
  progress: fc.oneof(fc.constant(undefined), downloadProgressArbitrary),
});

describe('broadcastUpdateState', () => {
  describe('Property: Completeness - all active windows receive the state', () => {
    it('should send state to all active windows', () => {
      fc.assert(
        fc.property(
          updateStateArbitrary,
          fc.integer({ min: 1, max: 10 }),
          (state: UpdateState, windowCount: number) => {
            const windows = Array.from({ length: windowCount }, () => createMockWindow(false));

            broadcastUpdateState(state, windows as any);

            windows.forEach((window) => {
              expect(window.webContents.send).toHaveBeenCalledTimes(1);
              expect(window.webContents.send).toHaveBeenCalledWith('update-state', state);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should broadcast to multiple windows independently', () => {
      fc.assert(
        fc.property(updateStateArbitrary, (state: UpdateState) => {
          const windows = [createMockWindow(false), createMockWindow(false), createMockWindow(false)];

          broadcastUpdateState(state, windows as any);

          expect(windows[0].webContents.send).toHaveBeenCalledWith('update-state', state);
          expect(windows[1].webContents.send).toHaveBeenCalledWith('update-state', state);
          expect(windows[2].webContents.send).toHaveBeenCalledWith('update-state', state);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Safety - destroyed windows are skipped without error', () => {
    it('should skip destroyed windows without throwing', () => {
      fc.assert(
        fc.property(updateStateArbitrary, (state: UpdateState) => {
          const destroyedWindow = createMockWindow(true);
          const activeWindow = createMockWindow(false);

          expect(() => {
            broadcastUpdateState(state, [destroyedWindow, activeWindow] as any);
          }).not.toThrow();

          expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
          expect(activeWindow.webContents.send).toHaveBeenCalledWith('update-state', state);
        }),
        { numRuns: 50 }
      );
    });

    it('should handle all windows being destroyed', () => {
      fc.assert(
        fc.property(updateStateArbitrary, fc.integer({ min: 0, max: 5 }), (state: UpdateState, windowCount: number) => {
          const windows = Array.from({ length: windowCount }, () => createMockWindow(true));

          expect(() => {
            broadcastUpdateState(state, windows as any);
          }).not.toThrow();

          windows.forEach((window) => {
            expect(window.webContents.send).not.toHaveBeenCalled();
          });
        }),
        { numRuns: 50 }
      );
    });

    it('should skip destroyed windows mixed with active windows', () => {
      fc.assert(
        fc.property(updateStateArbitrary, (state: UpdateState) => {
          const windows = [
            createMockWindow(false),
            createMockWindow(true),
            createMockWindow(false),
            createMockWindow(true),
            createMockWindow(false),
          ];

          broadcastUpdateState(state, windows as any);

          expect(windows[0].webContents.send).toHaveBeenCalledWith('update-state', state);
          expect(windows[1].webContents.send).not.toHaveBeenCalled();
          expect(windows[2].webContents.send).toHaveBeenCalledWith('update-state', state);
          expect(windows[3].webContents.send).not.toHaveBeenCalled();
          expect(windows[4].webContents.send).toHaveBeenCalledWith('update-state', state);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Emptiness - handles empty window lists gracefully', () => {
    it('should handle empty window list without throwing', () => {
      fc.assert(
        fc.property(updateStateArbitrary, (state: UpdateState) => {
          expect(() => {
            broadcastUpdateState(state, []);
          }).not.toThrow();
        }),
        { numRuns: 50 }
      );
    });

    it('should return void when no windows', () => {
      fc.assert(
        fc.property(updateStateArbitrary, (state: UpdateState) => {
          const result = broadcastUpdateState(state, []);
          expect(result).toBeUndefined();
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Channel correctness - uses correct IPC channel', () => {
    it('should always use "update-state" channel', () => {
      fc.assert(
        fc.property(updateStateArbitrary, fc.integer({ min: 1, max: 5 }), (state: UpdateState, windowCount: number) => {
          const windows = Array.from({ length: windowCount }, () => createMockWindow(false));

          broadcastUpdateState(state, windows as any);

          windows.forEach((window) => {
            const calls = window.webContents.send.mock.calls;
            calls.forEach((call: any[]) => {
              expect(call[0]).toBe('update-state');
            });
          });
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: State preservation - state object passed unchanged', () => {
    it('should pass exact state object to each window', () => {
      fc.assert(
        fc.property(updateStateArbitrary, (state: UpdateState) => {
          const windows = [createMockWindow(false), createMockWindow(false), createMockWindow(false)];

          broadcastUpdateState(state, windows as any);

          windows.forEach((window) => {
            const [, receivedState] = window.webContents.send.mock.calls[0];
            expect(receivedState).toEqual(state);
            expect(receivedState).toBe(state);
          });
        }),
        { numRuns: 50 }
      );
    });

    it('should preserve all state properties (phase, detail, version, progress)', () => {
      const stateWithAllProps: UpdateState = {
        phase: 'downloading',
        detail: 'Downloading update...',
        version: '1.2.3',
        progress: {
          percent: 50,
          bytesPerSecond: 1024000,
          transferred: 50000000,
          total: 100000000,
        },
      };

      const windows = [createMockWindow(false)];

      broadcastUpdateState(stateWithAllProps, windows as any);

      const [, receivedState] = windows[0].webContents.send.mock.calls[0];
      expect(receivedState).toEqual(stateWithAllProps);
      expect(receivedState.phase).toBe('downloading');
      expect(receivedState.detail).toBe('Downloading update...');
      expect(receivedState.version).toBe('1.2.3');
      expect(receivedState.progress?.percent).toBe(50);
    });
  });

  describe('Property: Non-blocking - returns immediately', () => {
    it('should return void (not promise)', () => {
      fc.assert(
        fc.property(updateStateArbitrary, (state: UpdateState) => {
          const windows = [createMockWindow(false)];
          const result = broadcastUpdateState(state, windows as any);

          expect(result).toBeUndefined();
        }),
        { numRuns: 50 }
      );
    });

    it('should not return a promise', () => {
      const state: UpdateState = { phase: 'idle' };
      const windows = [createMockWindow(false)];

      const result = broadcastUpdateState(state, windows as any);

      expect(result).not.toBeInstanceOf(Promise);
    });
  });

  describe('Property: Isolation - each window receives independently', () => {
    it('should send to each window independently (not broadcast)', () => {
      fc.assert(
        fc.property(updateStateArbitrary, (state: UpdateState) => {
          const windows = [createMockWindow(false), createMockWindow(false), createMockWindow(false)];

          broadcastUpdateState(state, windows as any);

          expect(windows[0].webContents.send).toHaveBeenCalledTimes(1);
          expect(windows[1].webContents.send).toHaveBeenCalledTimes(1);
          expect(windows[2].webContents.send).toHaveBeenCalledTimes(1);
        }),
        { numRuns: 50 }
      );
    });

    it('should call isDestroyed exactly once per window', () => {
      fc.assert(
        fc.property(
          updateStateArbitrary,
          fc.integer({ min: 1, max: 10 }),
          (state: UpdateState, windowCount: number) => {
            const windows = Array.from({ length: windowCount }, () => createMockWindow(false));

            broadcastUpdateState(state, windows as any);

            windows.forEach((window) => {
              expect(window.isDestroyed).toHaveBeenCalledTimes(1);
            });
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Null/undefined handling', () => {
    it('should skip null windows in array', () => {
      const state: UpdateState = { phase: 'idle' };
      const activeWindow = createMockWindow(false);

      broadcastUpdateState(state, [null, activeWindow, null] as any);

      expect(activeWindow.webContents.send).toHaveBeenCalledWith('update-state', state);
    });

    it('should skip undefined windows in array', () => {
      const state: UpdateState = { phase: 'idle' };
      const activeWindow = createMockWindow(false);

      broadcastUpdateState(state, [undefined, activeWindow, undefined] as any);

      expect(activeWindow.webContents.send).toHaveBeenCalledWith('update-state', state);
    });
  });

  describe('Example-based tests: Critical scenarios', () => {
    it('Example: Simple idle state to single window', () => {
      const state: UpdateState = {
        phase: 'idle',
      };
      const window = createMockWindow(false);

      broadcastUpdateState(state, [window] as any);

      expect(window.webContents.send).toHaveBeenCalledWith('update-state', state);
    });

    it('Example: Downloading state with progress to multiple windows', () => {
      const state: UpdateState = {
        phase: 'downloading',
        version: '2.0.0',
        detail: 'Downloading version 2.0.0',
        progress: {
          percent: 45,
          bytesPerSecond: 5000000,
          transferred: 450000000,
          total: 1000000000,
        },
      };

      const windows = [createMockWindow(false), createMockWindow(false)];

      broadcastUpdateState(state, windows as any);

      expect(windows[0].webContents.send).toHaveBeenCalledWith('update-state', state);
      expect(windows[1].webContents.send).toHaveBeenCalledWith('update-state', state);
    });

    it('Example: Ready state with version to window', () => {
      const state: UpdateState = {
        phase: 'ready',
        version: '1.5.0',
      };

      const window = createMockWindow(false);

      broadcastUpdateState(state, [window] as any);

      expect(window.webContents.send).toHaveBeenCalledWith('update-state', state);
    });

    it('Example: Failed state with detail message', () => {
      const state: UpdateState = {
        phase: 'failed',
        detail: 'Network error during download',
      };

      const windows = [createMockWindow(false), createMockWindow(true), createMockWindow(false)];

      broadcastUpdateState(state, windows as any);

      expect(windows[0].webContents.send).toHaveBeenCalledWith('update-state', state);
      expect(windows[1].webContents.send).not.toHaveBeenCalled();
      expect(windows[2].webContents.send).toHaveBeenCalledWith('update-state', state);
    });
  });
});

/**
 * Property-based tests for registerHandlers
 *
 * Tests verify all contract properties:
 * - Completeness: all 6 handlers registered with correct channel names
 * - Consistency: channel names match domain:action pattern
 * - Invocation: handlers call correct dependency methods
 * - Arguments: config:set passes config object correctly
 * - Return types: handlers return correct promise types
 */

describe('registerHandlers', () => {
  let mockIpcMain: any;
  let handlers: Map<string, Function>;

  beforeEach(() => {
    handlers = new Map();

    // Get the mocked ipcMain from electron module
    const { ipcMain } = require('electron');

    // Setup the mock to store handlers in our Map
    ipcMain.handle.mockImplementation((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    });

    mockIpcMain = ipcMain;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createMockDependencies(): any {
    return {
      getStatus: jest.fn<() => Promise<any>>().mockResolvedValue({
        version: '1.0.0',
        platform: 'darwin' as const,
        updateState: { phase: 'idle' as const },
        logs: [],
      }),
      checkForUpdates: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      downloadUpdate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      restartToUpdate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getConfig: jest.fn<() => Promise<any>>().mockResolvedValue({ autoUpdate: true, logLevel: 'info' as const }),
      setConfig: jest.fn<(config: any) => Promise<any>>().mockResolvedValue({ autoUpdate: true, logLevel: 'info' as const }),
      getState: jest.fn<(key: string) => Promise<string | null>>().mockResolvedValue(null),
      setState: jest.fn<(key: string, value: string) => Promise<void>>().mockResolvedValue(undefined),
      deleteState: jest.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined),
      getAllState: jest.fn<() => Promise<Record<string, string>>>().mockResolvedValue({} as any),
    };
  }

  function createNostlingDependencies(): any {
    const exampleIdentity: NostlingIdentity = {
      id: 'id-1',
      npub: 'npub1',
      secretRef: 'ref1',
      label: 'Primary',
      createdAt: new Date().toISOString(),
    };

    const exampleContact: NostlingContact = {
      id: 'contact-1',
      identityId: 'id-1',
      npub: 'npub-contact',
      alias: 'Alice',
      state: 'pending',
      createdAt: new Date().toISOString(),
    };

    const exampleMessage: NostlingMessage = {
      id: 'msg-1',
      identityId: 'id-1',
      contactId: 'contact-1',
      senderNpub: 'npub1',
      recipientNpub: 'npub-contact',
      content: 'hi',
      timestamp: new Date().toISOString(),
      status: 'queued',
      direction: 'outgoing',
      isRead: true,
    };

    const relayConfig: NostlingRelayConfig = {
      defaults: [
        { url: 'wss://relay.example.com', read: true, write: true, order: 0 },
      ],
    };

    const exampleRelays: NostlingRelayEndpoint[] = [
      { url: 'wss://relay.damus.io', read: true, write: true, order: 0 },
      { url: 'wss://relay.primal.net', read: true, write: true, order: 1 },
    ];

    return {
      listIdentities: jest.fn<() => Promise<NostlingIdentity[]>>().mockResolvedValue([exampleIdentity]),
      createIdentity: jest.fn<() => Promise<NostlingIdentity>>().mockResolvedValue(exampleIdentity),
      removeIdentity: jest.fn<() => Promise<void>>().mockResolvedValue(),
      updateIdentityLabel: jest.fn<() => Promise<NostlingIdentity>>().mockResolvedValue({
        ...exampleIdentity,
        label: 'Updated',
      }),
      updateIdentityTheme: jest.fn<() => Promise<void>>().mockResolvedValue(),
      listContacts: jest.fn<() => Promise<NostlingContact[]>>().mockResolvedValue([exampleContact]),
      addContact: jest.fn<() => Promise<NostlingContact>>().mockResolvedValue(exampleContact),
      removeContact: jest.fn<() => Promise<void>>().mockResolvedValue(),
      updateContactAlias: jest.fn<() => Promise<NostlingContact>>().mockResolvedValue({
        ...exampleContact,
        alias: 'Updated Alias',
      }),
      clearContactAlias: jest.fn<() => Promise<NostlingContact>>().mockResolvedValue({
        ...exampleContact,
        alias: '',
      }),
      markContactConnected: jest
        .fn<() => Promise<NostlingContact>>()
        .mockResolvedValue({ ...exampleContact, state: 'connected' as const }),
      listMessages: jest.fn<() => Promise<NostlingMessage[]>>().mockResolvedValue([exampleMessage]),
      sendMessage: jest.fn<() => Promise<NostlingMessage>>().mockResolvedValue(exampleMessage),
      discardUnknown: jest.fn<() => Promise<void>>().mockResolvedValue(),
      getRelayConfig: jest.fn<() => Promise<NostlingRelayConfig>>().mockResolvedValue(relayConfig),
      setRelayConfig: jest.fn<(config: NostlingRelayConfig) => Promise<NostlingRelayConfig>>()
        .mockResolvedValue(relayConfig),
      getRelaysForIdentity: jest.fn<(identityId: string) => Promise<NostlingRelayEndpoint[]>>()
        .mockResolvedValue(exampleRelays),
      setRelaysForIdentity: jest.fn<(identityId: string, relays: NostlingRelayEndpoint[]) => Promise<any>>()
        .mockResolvedValue({ config: { defaults: exampleRelays, perIdentity: {} }, conflict: undefined }),
      reloadRelaysForIdentity: jest.fn<(identityId: string) => Promise<NostlingRelayEndpoint[]>>()
        .mockResolvedValue(exampleRelays),
      getRelayStatus: jest.fn<() => Promise<Record<string, string>>>()
        .mockResolvedValue({ 'wss://relay.damus.io': 'connected', 'wss://relay.primal.net': 'connecting' }),
      onRelayStatusChange: jest.fn<(callback: (url: string, status: string) => void) => void>()
        .mockReturnValue(undefined),
      markMessagesRead: jest.fn<(identityId: string, contactId: string) => Promise<number>>()
        .mockResolvedValue(2),
      getUnreadCounts: jest.fn<(identityId: string) => Promise<Record<string, number>>>()
        .mockResolvedValue({ 'contact-1': 3 }),
      retryFailedMessages: jest.fn<(identityId?: string) => Promise<any>>()
        .mockResolvedValue({ retried: 0 }),
      getPrivateAuthoredProfile: jest.fn<(identityId: string) => Promise<any>>()
        .mockResolvedValue({
          id: 'profile-1',
          ownerPubkey: 'pubkey-hex',
          source: 'private_authored',
          content: { name: 'Test User', about: 'Bio' },
        }),
      getContactProfile: jest.fn<(contactId: string) => Promise<any>>()
        .mockResolvedValue({
          id: 'profile-2',
          ownerPubkey: 'contact-pubkey-hex',
          source: 'private_received',
          content: { name: 'Contact', about: 'Contact bio', picture: 'https://example.com/pic.jpg' },
        }),
      updatePrivateProfile: jest.fn<(request: { identityId: string; content: any }) => Promise<any>>()
        .mockResolvedValue({
          id: 'profile-1',
          ownerPubkey: 'pubkey-hex',
          source: 'private_authored',
          content: { name: 'Updated User', about: 'New bio' },
        }),
      onProfileUpdated: jest.fn<(callback: (identityId: string) => void) => void>()
        .mockReturnValue(undefined),
    };
  }

  describe('Property: Completeness - all handlers registered', () => {
    it('should register 15 IPC handlers (11 new + 3 legacy + 1 test-only)', () => {
      const deps = createMockDependencies();
      registerHandlers(deps);
      // 11 new handlers: system:get-status, system:open-external, updates:check, updates:download, updates:restart,
      //                  config:get, config:set, state:get, state:set, state:delete, state:get-all
      // 3 legacy handlers: status:get, update:check, update:restart
      // 1 test-only handler: test:inject-profile (only in test mode)
      expect(handlers.size).toBe(15);
    });

    it('should register all required channel names', () => {
      const deps = createMockDependencies();
      registerHandlers(deps);

      const expectedChannels = [
        'system:get-status',
        'updates:check',
        'updates:download',
        'updates:restart',
        'config:get',
        'config:set',
      ];

      expectedChannels.forEach((channel) => {
        expect(handlers.has(channel)).toBe(true);
      });
    });
  });

  describe('Property: Consistency - domain prefix naming pattern', () => {
    it('should use correct domain prefixes in channel names', () => {
      const deps = createMockDependencies();
      registerHandlers(deps);

      const allChannels = Array.from(handlers.keys());
      const systemChannels = allChannels.filter((ch) => ch.startsWith('system:'));
      const updatesChannels = allChannels.filter((ch) => ch.startsWith('updates:'));
      const configChannels = allChannels.filter((ch) => ch.startsWith('config:'));

      expect(systemChannels).toEqual(['system:get-status', 'system:open-external']);
      expect(updatesChannels).toContain('updates:check');
      expect(updatesChannels).toContain('updates:download');
      expect(updatesChannels).toContain('updates:restart');
      expect(configChannels).toContain('config:get');
      expect(configChannels).toContain('config:set');
    });

    it('should use consistent domain:action naming throughout', () => {
      const deps = createMockDependencies();
      registerHandlers(deps);

      const allChannels = Array.from(handlers.keys());
      allChannels.forEach((channel) => {
        expect(channel).toMatch(
          /^(system|updates|config|state|status|update|test):[a-z-]+$|^nostling:(identities|contacts|messages|relays|profiles|image-cache):[a-z-]+$/
        );
      });
    });
  });

  describe('Property: Invocation - handlers call correct dependency methods', () => {
    it('system:get-status should invoke getStatus', async () => {
      const deps = createMockDependencies();
      registerHandlers(deps);

      const handler = handlers.get('system:get-status');
      await handler!();

      expect(deps.getStatus).toHaveBeenCalledTimes(1);
      expect(deps.getStatus).toHaveBeenCalledWith();
    });

    it('updates:check should invoke checkForUpdates', async () => {
      const deps = createMockDependencies();
      registerHandlers(deps);

      const handler = handlers.get('updates:check');
      await handler!();

      expect(deps.checkForUpdates).toHaveBeenCalledTimes(1);
      expect(deps.checkForUpdates).toHaveBeenCalledWith();
    });

    it('updates:download should invoke downloadUpdate', async () => {
      const deps = createMockDependencies();
      registerHandlers(deps);

      const handler = handlers.get('updates:download');
      await handler!();

      expect(deps.downloadUpdate).toHaveBeenCalledTimes(1);
      expect(deps.downloadUpdate).toHaveBeenCalledWith();
    });

    it('updates:restart should invoke restartToUpdate', async () => {
      const deps = createMockDependencies();
      registerHandlers(deps);

      const handler = handlers.get('updates:restart');
      await handler!();

      expect(deps.restartToUpdate).toHaveBeenCalledTimes(1);
      expect(deps.restartToUpdate).toHaveBeenCalledWith();
    });

    it('config:get should invoke getConfig', async () => {
      const deps = createMockDependencies();
      registerHandlers(deps);

      const handler = handlers.get('config:get');
      await handler!();

      expect(deps.getConfig).toHaveBeenCalledTimes(1);
      expect(deps.getConfig).toHaveBeenCalledWith();
    });

    it('config:set should invoke setConfig with provided config', async () => {
      const deps = createMockDependencies();
      registerHandlers(deps);

      const handler = handlers.get('config:set');
      const partialConfig: Partial<AppConfig> = { autoUpdate: false };
      await handler!(null, partialConfig);

      expect(deps.setConfig).toHaveBeenCalledTimes(1);
      expect(deps.setConfig).toHaveBeenCalledWith(partialConfig);
    });
  });

  describe('Property: Arguments - config:set passes config correctly', () => {
    it('should pass config as second argument to handler', async () => {
      const deps = createMockDependencies();
      registerHandlers(deps);

      const handler = handlers.get('config:set');
      const partialConfig1: Partial<AppConfig> = { autoUpdate: true };
      await handler!(null, partialConfig1);
      expect(deps.setConfig).toHaveBeenCalledWith(partialConfig1);

      deps.setConfig.mockClear();

      const partialConfig2: Partial<AppConfig> = { logLevel: 'warn' as const };
      await handler!(null, partialConfig2);
      expect(deps.setConfig).toHaveBeenCalledWith(partialConfig2);
    });
  });

  describe('Property: Return types - handlers return correct types', () => {
    it('system:get-status returns AppStatus promise', async () => {
      const mockStatus: AppStatus = {
        version: '2.0.0',
        platform: 'linux',
        updateState: { phase: 'available' },
        logs: [],
      };

      const deps = createMockDependencies();
      deps.getStatus.mockResolvedValue(mockStatus);
      registerHandlers(deps);

      const handler = handlers.get('system:get-status');
      const result = await handler!();

      expect(result).toEqual(mockStatus);
      expect(result.version).toBe('2.0.0');
      expect(result.platform).toBe('linux');
    });

    it('config:get returns AppConfig promise', async () => {
      const mockConfig: AppConfig = {
        autoUpdate: false,
        logLevel: 'debug',
      };

      const deps = createMockDependencies();
      deps.getConfig.mockResolvedValue(mockConfig);
      registerHandlers(deps);

      const handler = handlers.get('config:get');
      const result = await handler!();

      expect(result).toEqual(mockConfig);
      expect(result.autoUpdate).toBe(false);
      expect(result.logLevel).toBe('debug');
    });

    it('config:set returns modified AppConfig promise', async () => {
      const updatedConfig: AppConfig = { autoUpdate: true, logLevel: 'error' };

      const deps = createMockDependencies();
      deps.setConfig.mockResolvedValue(updatedConfig);
      registerHandlers(deps);

      const handler = handlers.get('config:set');
      const result = await handler!(null, { autoUpdate: true });

      expect(result).toEqual(updatedConfig);
    });
  });

  describe('Property: Idempotency - calling multiple times works', () => {
    it('should allow multiple registrations', () => {
      const deps1 = createMockDependencies();
      const deps2 = createMockDependencies();

      registerHandlers(deps1);
      // Updated to reflect 14 handlers (11 new + 3 legacy) + 1 test-only handler in test mode
      expect(mockIpcMain.handle).toHaveBeenCalledTimes(15);

      handlers.clear();
      registerHandlers(deps2);
      expect(mockIpcMain.handle).toHaveBeenCalledTimes(30);

      expect(handlers.size).toBe(15);
    });
  });

  describe('Property: Error propagation - promise rejections propagate', () => {
    it('should propagate errors from getStatus', async () => {
      const testError = new Error('Status error');
      const deps = createMockDependencies();
      deps.getStatus.mockRejectedValue(testError);
      registerHandlers(deps);

      const handler = handlers.get('system:get-status');
      await expect(handler!()).rejects.toThrow('Status error');
    });

    it('should propagate errors from checkForUpdates', async () => {
      const testError = new Error('Check failed');
      const deps = createMockDependencies();
      deps.checkForUpdates.mockRejectedValue(testError);
      registerHandlers(deps);

      const handler = handlers.get('updates:check');
      await expect(handler!()).rejects.toThrow('Check failed');
    });

    it('should propagate errors from setConfig', async () => {
      const testError = new Error('Config error');
      const deps = createMockDependencies();
      deps.setConfig.mockRejectedValue(testError);
      registerHandlers(deps);

      const handler = handlers.get('config:set');
      await expect(handler!(null, { autoUpdate: false })).rejects.toThrow('Config error');
    });
  });

  describe('Example-based tests: Critical scenarios', () => {
    it('Example: Full initialization with all handlers working', () => {
      const deps = createMockDependencies();
      registerHandlers(deps);

      // Updated to reflect 14 handlers (11 new + 3 legacy) + 1 test-only handler in test mode
      expect(handlers.size).toBe(15);
      expect(handlers.has('system:get-status')).toBe(true);
      expect(handlers.has('system:open-external')).toBe(true);
      expect(handlers.has('updates:check')).toBe(true);
      expect(handlers.has('updates:download')).toBe(true);
      expect(handlers.has('updates:restart')).toBe(true);
      expect(handlers.has('config:get')).toBe(true);
      expect(handlers.has('config:set')).toBe(true);
      // Legacy handlers for backward compatibility
      expect(handlers.has('status:get')).toBe(true);
      expect(handlers.has('update:check')).toBe(true);
      expect(handlers.has('update:restart')).toBe(true);
    });

    it('Example: Update flow sequence', async () => {
      const deps = createMockDependencies();
      registerHandlers(deps);

      const checkHandler = handlers.get('updates:check');
      await checkHandler!();
      expect(deps.checkForUpdates).toHaveBeenCalled();

      const downloadHandler = handlers.get('updates:download');
      await downloadHandler!();
      expect(deps.downloadUpdate).toHaveBeenCalled();

      const restartHandler = handlers.get('updates:restart');
      await restartHandler!();
      expect(deps.restartToUpdate).toHaveBeenCalled();
    });

    it('Example: Config get and set flow', async () => {
      const initialConfig: AppConfig = { autoUpdate: false, logLevel: 'warn' };
      const updatedConfig: AppConfig = { autoUpdate: true, logLevel: 'debug' };

      const deps = createMockDependencies();
      deps.getConfig.mockResolvedValue(initialConfig);
      deps.setConfig.mockResolvedValue(updatedConfig);
      registerHandlers(deps);

      const getHandler = handlers.get('config:get');
      const result1 = await getHandler!();
      expect(result1).toEqual(initialConfig);

      const setHandler = handlers.get('config:set');
      const result2 = await setHandler!(null, { autoUpdate: true, logLevel: 'debug' });
      expect(result2).toEqual(updatedConfig);
    });

    it('Example: Nostling handlers register when provided', async () => {
      const deps = createMockDependencies();
      const nostlingDeps = createNostlingDependencies();
      registerHandlers({ ...deps, nostling: nostlingDeps });

      // Base handlers (14) plus nostling channels (including retryFailedMessages, rename flows, relay handlers, updateTheme, unread handlers, profile handlers including getContactProfile, and clearContactAlias) + 1 test-only handler in test mode
      expect(handlers.size).toBe(39);
      expect(handlers.has('nostling:identities:list')).toBe(true);
      expect(handlers.has('nostling:contacts:add')).toBe(true);
      expect(handlers.has('nostling:messages:send')).toBe(true);
      expect(handlers.has('nostling:relays:set')).toBe(true);

      await handlers.get('nostling:identities:list')!();
      expect(nostlingDeps.listIdentities).toHaveBeenCalled();

      await handlers.get('nostling:contacts:add')!(null, { identityId: 'id-1', npub: 'npub', alias: 'bob' });
      expect(nostlingDeps.addContact).toHaveBeenCalled();

      // Test clearContactAlias handler
      expect(handlers.has('nostling:contacts:clear-alias')).toBe(true);
      await handlers.get('nostling:contacts:clear-alias')!(null, 'contact-1');
      expect(nostlingDeps.clearContactAlias).toHaveBeenCalledWith('contact-1');

      await handlers.get('nostling:messages:send')!(null, {
        identityId: 'id-1',
        contactId: 'contact-1',
        plaintext: 'hi',
      });
      expect(nostlingDeps.sendMessage).toHaveBeenCalled();

      const relays: NostlingRelayEndpoint[] = [{ url: 'wss://relay.test', read: true, write: true, order: 0 }];
      await handlers.get('nostling:relays:set')!(null, 'test-identity', relays);
      expect(nostlingDeps.setRelaysForIdentity).toHaveBeenCalledWith('test-identity', relays);
    });
  });

  describe('IPC Error Propagation - Secret Storage Security (R5)', () => {
    describe('nostling:identities:create error handling', () => {
      it('uses SECURE_STORAGE_UNAVAILABLE error code for SecureStorageUnavailableError', async () => {
        const testError = new SecureStorageUnavailableError('Keychain unavailable');
        const nostlingDeps: any = createNostlingDependencies();
        nostlingDeps.createIdentity = jest.fn<() => Promise<any>>().mockRejectedValue(testError);

        handlers.clear();
        registerHandlers({ ...createMockDependencies() as any, nostling: nostlingDeps });

        const handler = handlers.get('nostling:identities:create');
        const request: CreateIdentityRequest = { npub: 'test-npub', secretRef: 'ref-1', label: 'Test' };
        const result = await handler!(null, request);

        expect(result.success).toBe(false);
        expect(result.error).toBe('SECURE_STORAGE_UNAVAILABLE');
        expect(result.message).toBe('Keychain unavailable');
      });
    });

    describe('nostling:identities:list error handling', () => {
      it('uses SECRET_DECRYPTION_FAILED error code for SecretDecryptionError', async () => {
        const testError = new SecretDecryptionError('Keychain lost');
        const nostlingDeps: any = createNostlingDependencies();
        nostlingDeps.listIdentities = jest.fn<() => Promise<any>>().mockRejectedValue(testError);

        handlers.clear();
        registerHandlers({ ...createMockDependencies() as any, nostling: nostlingDeps });

        const handler = handlers.get('nostling:identities:list');
        const result = await handler!();

        expect(result.success).toBe(false);
        expect(result.error).toBe('SECRET_DECRYPTION_FAILED');
        expect(result.message).toBe('Keychain lost');
      });
    });

    describe('Backward compatibility - success responses unchanged', () => {
      it('returns identity directly on success (not wrapped)', async () => {
        const exampleIdentity: NostlingIdentity = {
          id: 'id-1',
          npub: 'npub1',
          secretRef: 'ref1',
          label: 'Primary',
          createdAt: new Date().toISOString(),
        };

        const nostlingDeps: any = createNostlingDependencies();
        nostlingDeps.createIdentity = jest.fn<() => Promise<any>>().mockResolvedValue(exampleIdentity);

        handlers.clear();
        registerHandlers({ ...createMockDependencies() as any, nostling: nostlingDeps });

        const handler = handlers.get('nostling:identities:create');
        const request: CreateIdentityRequest = { npub: 'test-npub', secretRef: 'ref-1', label: 'Test' };
        const result = await handler!(null, request);

        expect(result).toEqual(exampleIdentity);
        expect(result.id).toBe('id-1');
        expect(result.npub).toBe('npub1');
        expect((result as any).success).toBeUndefined();
      });

      it('returns identities array directly on successful list (not wrapped)', async () => {
        const exampleIdentities: NostlingIdentity[] = [
          {
            id: 'id-1',
            npub: 'npub1',
            secretRef: 'ref1',
            label: 'Primary',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'id-2',
            npub: 'npub2',
            secretRef: 'ref2',
            label: 'Secondary',
            createdAt: new Date().toISOString(),
          },
        ];

        const nostlingDeps: any = createNostlingDependencies();
        nostlingDeps.listIdentities = jest.fn<() => Promise<any>>().mockResolvedValue(exampleIdentities);

        handlers.clear();
        registerHandlers({ ...createMockDependencies() as any, nostling: nostlingDeps });

        const handler = handlers.get('nostling:identities:list');
        const result = await handler!();

        expect(result).toEqual(exampleIdentities);
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);
      });
    });

    describe('Example-based tests: Critical error scenarios', () => {
      it('Example: SecureStorageUnavailableError with detailed message', async () => {
        const testError = new SecureStorageUnavailableError(
          'Linux secure storage backend is "basic_text" (plaintext). Cannot store secrets securely.'
        );
        const nostlingDeps: any = createNostlingDependencies();
        nostlingDeps.createIdentity = jest.fn<() => Promise<any>>().mockRejectedValue(testError);

        handlers.clear();
        registerHandlers({ ...createMockDependencies() as any, nostling: nostlingDeps });

        const handler = handlers.get('nostling:identities:create');
        const request: CreateIdentityRequest = { npub: 'test-npub', secretRef: 'ref-1', label: 'Test' };
        const result = await handler!(null, request);

        expect(result.success).toBe(false);
        expect(result.error).toBe('SECURE_STORAGE_UNAVAILABLE');
        expect(result.message).toContain('basic_text');
      });

      it('Example: SecretDecryptionError with recovery guidance', async () => {
        const testError = new SecretDecryptionError(
          'Failed to decrypt secret. This typically occurs when the system keychain was reset or the app was moved to a different machine. Please delete this identity and recreate it by re-entering your nsec.'
        );
        const nostlingDeps: any = createNostlingDependencies();
        nostlingDeps.listIdentities = jest.fn<() => Promise<any>>().mockRejectedValue(testError);

        handlers.clear();
        registerHandlers({ ...createMockDependencies() as any, nostling: nostlingDeps });

        const handler = handlers.get('nostling:identities:list');
        const result = await handler!();

        expect(result.success).toBe(false);
        expect(result.error).toBe('SECRET_DECRYPTION_FAILED');
        expect(result.message).toContain('nsec');
      });

      it('Example: Successful identity creation preserves exact data', async () => {
        const exampleIdentity: NostlingIdentity = {
          id: 'id-xyz-789',
          npub: 'npub-example',
          secretRef: 'nostr-secret:12345678',
          label: 'My Identity',
          createdAt: '2025-12-17T10:00:00Z',
        };

        const nostlingDeps: any = createNostlingDependencies();
        nostlingDeps.createIdentity = jest.fn<() => Promise<any>>().mockResolvedValue(exampleIdentity);

        handlers.clear();
        registerHandlers({ ...createMockDependencies() as any, nostling: nostlingDeps });

        const handler = handlers.get('nostling:identities:create');
        const request: CreateIdentityRequest = { npub: 'test-npub', secretRef: 'ref-1', label: 'My Identity' };
        const result = await handler!(null, request);

        expect(result).toEqual(exampleIdentity);
        expect(result.id).toBe('id-xyz-789');
        expect(result.secretRef).toBe('nostr-secret:12345678');
      });
    });
  });

  describe('Relay IPC Handlers - Per-Identity Relays', () => {
    it('nostling:relays:get should pass identityId to handler', async () => {
      const mockDeps = createMockDependencies();
      const nostlingDeps: any = {
        listIdentities: (jest.fn() as any).mockResolvedValue([] as any),
        createIdentity: jest.fn(),
        removeIdentity: jest.fn(),
        listContacts: (jest.fn() as any).mockResolvedValue([] as any),
        addContact: jest.fn(),
        removeContact: jest.fn(),
        markContactConnected: jest.fn(),
        listMessages: (jest.fn() as any).mockResolvedValue([] as any),
        sendMessage: jest.fn(),
        discardUnknown: jest.fn(),
        retryFailedMessages: (jest.fn() as any).mockResolvedValue([] as any),
        getRelayConfig: jest.fn(),
        setRelayConfig: jest.fn(),
        getRelaysForIdentity: (jest.fn() as any).mockResolvedValue([
          { url: 'wss://relay.test', read: true, write: true, order: 0 }
        ]),
        setRelaysForIdentity: (jest.fn() as any).mockResolvedValue({ config: undefined, conflict: { conflicted: true, message: 'test' } }),
        reloadRelaysForIdentity: (jest.fn() as any).mockResolvedValue([] as any),
        getRelayStatus: (jest.fn() as any).mockResolvedValue({} as any),
        onRelayStatusChange: jest.fn(),
      };

      handlers.clear();
      registerHandlers({ ...mockDeps as any, nostling: nostlingDeps });

      const handler = handlers.get('nostling:relays:get');
      await handler!(null, 'test-identity-id');

      expect(nostlingDeps.getRelaysForIdentity).toHaveBeenCalledWith('test-identity-id');
    });

    it('nostling:relays:set should pass identityId and relays to handler', async () => {
      const mockDeps = createMockDependencies();
      const testRelays: NostlingRelayEndpoint[] = [
        { url: 'wss://relay.damus.io', read: true, write: true, order: 0 }
      ];

      const nostlingDeps: any = {
        listIdentities: (jest.fn() as any).mockResolvedValue([] as any),
        createIdentity: jest.fn(),
        removeIdentity: jest.fn(),
        listContacts: (jest.fn() as any).mockResolvedValue([] as any),
        addContact: jest.fn(),
        removeContact: jest.fn(),
        markContactConnected: jest.fn(),
        listMessages: (jest.fn() as any).mockResolvedValue([] as any),
        sendMessage: jest.fn(),
        discardUnknown: jest.fn(),
        retryFailedMessages: (jest.fn() as any).mockResolvedValue([] as any),
        getRelayConfig: jest.fn(),
        setRelayConfig: jest.fn(),
        getRelaysForIdentity: jest.fn(),
        setRelaysForIdentity: (jest.fn() as any).mockResolvedValue({ config: { defaults: testRelays, perIdentity: {} }, conflict: undefined }),
        reloadRelaysForIdentity: jest.fn(),
        getRelayStatus: jest.fn(),
        onRelayStatusChange: jest.fn(),
      };

      handlers.clear();
      registerHandlers({ ...mockDeps as any, nostling: nostlingDeps });

      const handler = handlers.get('nostling:relays:set');
      await handler!(null, 'test-identity-id', testRelays);

      expect(nostlingDeps.setRelaysForIdentity).toHaveBeenCalledWith('test-identity-id', testRelays);
    });

    it('nostling:relays:reload should call reloadRelaysForIdentity', async () => {
      const mockDeps = createMockDependencies();
      const nostlingDeps: any = {
        listIdentities: (jest.fn() as any).mockResolvedValue([] as any),
        createIdentity: jest.fn(),
        removeIdentity: jest.fn(),
        listContacts: (jest.fn() as any).mockResolvedValue([] as any),
        addContact: jest.fn(),
        removeContact: jest.fn(),
        markContactConnected: jest.fn(),
        listMessages: (jest.fn() as any).mockResolvedValue([] as any),
        sendMessage: jest.fn(),
        discardUnknown: jest.fn(),
        retryFailedMessages: (jest.fn() as any).mockResolvedValue([] as any),
        getRelayConfig: jest.fn(),
        setRelayConfig: jest.fn(),
        getRelaysForIdentity: jest.fn(),
        setRelaysForIdentity: jest.fn(),
        reloadRelaysForIdentity: (jest.fn() as any).mockResolvedValue([
          { url: 'wss://relay.fresh', read: true, write: true, order: 0 }
        ]),
        getRelayStatus: jest.fn(),
        onRelayStatusChange: jest.fn(),
      };

      handlers.clear();
      registerHandlers({ ...mockDeps as any, nostling: nostlingDeps });

      const handler = handlers.get('nostling:relays:reload');
      const result = await handler!(null, 'test-identity-id');

      expect(nostlingDeps.reloadRelaysForIdentity).toHaveBeenCalledWith('test-identity-id');
      expect(Array.isArray(result)).toBe(true);
    });

    it('nostling:relays:getStatus should return relay status map', async () => {
      const mockDeps = createMockDependencies();
      const statusMap = { 'wss://relay.damus.io': 'connected', 'wss://relay.primal.net': 'disconnected' };

      const nostlingDeps: any = {
        listIdentities: (jest.fn() as any).mockResolvedValue([] as any),
        createIdentity: jest.fn(),
        removeIdentity: jest.fn(),
        listContacts: (jest.fn() as any).mockResolvedValue([] as any),
        addContact: jest.fn(),
        removeContact: jest.fn(),
        markContactConnected: jest.fn(),
        listMessages: (jest.fn() as any).mockResolvedValue([] as any),
        sendMessage: jest.fn(),
        discardUnknown: jest.fn(),
        retryFailedMessages: (jest.fn() as any).mockResolvedValue([] as any),
        getRelayConfig: jest.fn(),
        setRelayConfig: jest.fn(),
        getRelaysForIdentity: jest.fn(),
        setRelaysForIdentity: jest.fn(),
        reloadRelaysForIdentity: jest.fn(),
        getRelayStatus: (jest.fn() as any).mockResolvedValue(statusMap as any),
        onRelayStatusChange: jest.fn(),
      };

      handlers.clear();
      registerHandlers({ ...mockDeps as any, nostling: nostlingDeps });

      const handler = handlers.get('nostling:relays:getStatus');
      const result = await handler!();

      expect(result).toEqual(statusMap);
      expect(result['wss://relay.damus.io']).toBe('connected');
    });

    it('nostling:relays:set should detect conflicts', async () => {
      const mockDeps = createMockDependencies();
      const conflict: RelayConfigConflict = { conflicted: true, message: 'External modification detected' };

      const nostlingDeps: any = {
        listIdentities: (jest.fn() as any).mockResolvedValue([] as any),
        createIdentity: jest.fn(),
        removeIdentity: jest.fn(),
        listContacts: (jest.fn() as any).mockResolvedValue([] as any),
        addContact: jest.fn(),
        removeContact: jest.fn(),
        markContactConnected: jest.fn(),
        listMessages: (jest.fn() as any).mockResolvedValue([] as any),
        sendMessage: jest.fn(),
        discardUnknown: jest.fn(),
        retryFailedMessages: (jest.fn() as any).mockResolvedValue([] as any),
        getRelayConfig: jest.fn(),
        setRelayConfig: jest.fn(),
        getRelaysForIdentity: jest.fn(),
        setRelaysForIdentity: (jest.fn() as any).mockResolvedValue({ config: undefined, conflict } as any),
        reloadRelaysForIdentity: jest.fn(),
        getRelayStatus: jest.fn(),
        onRelayStatusChange: jest.fn(),
      };

      handlers.clear();
      registerHandlers({ ...mockDeps as any, nostling: nostlingDeps });

      const handler = handlers.get('nostling:relays:set');
      const result = await handler!(null, 'identity-id', []);

      expect(result.conflict?.conflicted).toBe(true);
      expect(result.config).toBeUndefined();
    });
  });
});
