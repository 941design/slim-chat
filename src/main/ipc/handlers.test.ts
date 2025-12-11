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
} from '../../shared/types';

// Mock electron before importing handlers
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
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
      getAllState: jest.fn<() => Promise<Record<string, string>>>().mockResolvedValue({}),
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
      ciphertext: 'hi',
      timestamp: new Date().toISOString(),
      status: 'queued',
      direction: 'outgoing',
    };

    const relayConfig: NostlingRelayConfig = {
      defaults: [
        { url: 'wss://relay.example.com' },
      ],
    };

    return {
      listIdentities: jest.fn<() => Promise<NostlingIdentity[]>>().mockResolvedValue([exampleIdentity]),
      createIdentity: jest.fn<() => Promise<NostlingIdentity>>().mockResolvedValue(exampleIdentity),
      removeIdentity: jest.fn<() => Promise<void>>().mockResolvedValue(),
      listContacts: jest.fn<() => Promise<NostlingContact[]>>().mockResolvedValue([exampleContact]),
      addContact: jest.fn<() => Promise<NostlingContact>>().mockResolvedValue(exampleContact),
      removeContact: jest.fn<() => Promise<void>>().mockResolvedValue(),
      markContactConnected: jest
        .fn<() => Promise<NostlingContact>>()
        .mockResolvedValue({ ...exampleContact, state: 'connected' as const }),
      listMessages: jest.fn<() => Promise<NostlingMessage[]>>().mockResolvedValue([exampleMessage]),
      sendMessage: jest.fn<() => Promise<NostlingMessage>>().mockResolvedValue(exampleMessage),
      discardUnknown: jest.fn<() => Promise<void>>().mockResolvedValue(),
      getRelayConfig: jest.fn<() => Promise<NostlingRelayConfig>>().mockResolvedValue(relayConfig),
      setRelayConfig: jest.fn<(config: NostlingRelayConfig) => Promise<NostlingRelayConfig>>()
        .mockResolvedValue(relayConfig),
    };
  }

  describe('Property: Completeness - all handlers registered', () => {
    it('should register 13 IPC handlers (10 new + 3 legacy)', () => {
      const deps = createMockDependencies();
      registerHandlers(deps);
      // 10 new handlers: system:get-status, updates:check, updates:download, updates:restart,
      //                  config:get, config:set, state:get, state:set, state:delete, state:get-all
      // 3 legacy handlers: status:get, update:check, update:restart
      expect(handlers.size).toBe(13);
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

      expect(systemChannels).toEqual(['system:get-status']);
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
          /^(system|updates|config|state|status|update):[a-z-]+$|^nostling:(identities|contacts|messages|relays):[a-z-]+$/
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
      // Updated to reflect 13 handlers (10 new + 3 legacy)
      expect(mockIpcMain.handle).toHaveBeenCalledTimes(13);

      handlers.clear();
      registerHandlers(deps2);
      expect(mockIpcMain.handle).toHaveBeenCalledTimes(26);

      expect(handlers.size).toBe(13);
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

      // Updated to reflect 13 handlers (10 new + 3 legacy)
      expect(handlers.size).toBe(13);
      expect(handlers.has('system:get-status')).toBe(true);
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

      // Base handlers plus 13 nostling channels (including retryFailedMessages)
      expect(handlers.size).toBe(26);
      expect(handlers.has('nostling:identities:list')).toBe(true);
      expect(handlers.has('nostling:contacts:add')).toBe(true);
      expect(handlers.has('nostling:messages:send')).toBe(true);
      expect(handlers.has('nostling:relays:set')).toBe(true);

      await handlers.get('nostling:identities:list')!();
      expect(nostlingDeps.listIdentities).toHaveBeenCalled();

      await handlers.get('nostling:contacts:add')!(null, { identityId: 'id-1', npub: 'npub', alias: 'bob' });
      expect(nostlingDeps.addContact).toHaveBeenCalled();

      await handlers.get('nostling:messages:send')!(null, {
        identityId: 'id-1',
        contactId: 'contact-1',
        plaintext: 'hi',
      });
      expect(nostlingDeps.sendMessage).toHaveBeenCalled();

      const relayConfig = await nostlingDeps.getRelayConfig();
      await handlers.get('nostling:relays:set')!(null, relayConfig);
      expect(nostlingDeps.setRelayConfig).toHaveBeenCalledWith(relayConfig);
    });
  });
});
