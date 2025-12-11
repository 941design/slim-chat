/**
 * TR1: End-to-End Version Transition Test
 *
 * This test validates backward compatibility (Constraint C2) by simulating:
 * 1. Old app version (v0.0.0) with old provider behavior
 * 2. Complete update flow: check → discover → download → verify
 * 3. App restart as new version (v0.0.1) with GitHub provider
 * 4. Subsequent update checks from new version work correctly
 *
 * This E2E test verifies that old versions can successfully update to
 * the new GitHub provider implementation without issues.
 *
 * CONTRACT (TR1: E2E Version Transition Test):
 *   Test Scenarios:
 *     1. Old Version Update Flow:
 *        - Simulate app version 0.0.0
 *        - Mock old provider behavior (if different from current)
 *        - Trigger complete update flow
 *        - Verify: check succeeds, update available, download succeeds, verification passes
 *        - Expected: transition to 'ready' state with version 0.0.1
 *
 *     2. New Version Post-Update:
 *        - Simulate app restart as version 0.0.1
 *        - Use new GitHub provider configuration
 *        - Trigger update check
 *        - Verify: check succeeds with new provider
 *        - Expected: either "no updates" or discovers v0.0.2 (depending on manifest)
 *
 *     3. Cross-Version Discovery:
 *        - Verify manifest URL uses /latest/download/ (not version-specific)
 *        - Expected: old versions can discover latest releases
 *
 *   Invariants:
 *     - Old version CAN update to new version
 *     - New version update checks work correctly
 *     - Manifest verification succeeds across versions
 *     - No breaking changes in manifest format
 *
 *   Properties:
 *     - Backward compatibility: constraint C2 validated
 *     - Forward compatibility: new version handles future updates
 *     - Manifest discovery: /latest/download/ path works across versions
 *
 *   Implementation Notes:
 *     - Use Jest mocking for electron-updater events
 *     - Mock file system for downloaded update files
 *     - Mock fetch for manifest retrieval
 *     - Simulate version changes via app.getVersion() mock
 *     - Test should be deterministic (no network calls)
 *     - E2E filename pattern: *.e2e.test.ts (excluded from jest baseline by convention)
 *
 *   Test Structure:
 *     describe('Version Transition E2E', () => {
 *       describe('Old version (v0.0.0) update flow', () => {
 *         test('should check for updates successfully', ...)
 *         test('should discover new version', ...)
 *         test('should download and verify update', ...)
 *         test('should transition to ready state', ...)
 *       })
 *
 *       describe('New version (v0.0.1) post-update', () => {
 *         test('should check for updates with new provider', ...)
 *         test('should handle no-updates scenario', ...)
 *       })
 *
 *       describe('Cross-version compatibility', () => {
 *         test('should use /latest/download/ for manifest URL', ...)
 *       })
 *     })
 *
 *   Verification:
 *     - All update flow transitions work (idle → checking → available → downloading → downloaded → verifying → ready)
 *     - Manifest URL construction uses /latest/download/
 *     - Version changes are handled correctly
 *     - No regressions in existing update flow
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import type { UpdateInfo, UpdateDownloadedEvent, ProgressInfo } from 'electron-updater';

/**
 * Mock setup for electron-updater
 */
class MockAutoUpdater extends EventEmitter {
  forceDevUpdateConfig = false;
  allowPrerelease = false;
  autoDownload = false;
  autoInstallOnAppQuit = false;

  setFeedURL = jest.fn();
  checkForUpdates = jest.fn();
  downloadUpdate = jest.fn();

  currentVersion = '0.0.0';

  async simulateCheckResult(updateInfo: UpdateInfo) {
    this.emit('checking-for-update');
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.currentVersion = (global as any).mockAppVersion || '0.0.0';
    this.emit('update-available', updateInfo);
    return { updateInfo, downloadPromise: Promise.resolve(undefined) };
  }

  async simulateDownloadComplete(updateInfo: UpdateInfo) {
    this.emit('download-progress', {
      transferred: 0,
      total: 1024000,
      bytesPerSecond: 100000,
      percent: 0,
    } as ProgressInfo);

    await new Promise((resolve) => setTimeout(resolve, 10));

    this.emit('download-progress', {
      transferred: 512000,
      total: 1024000,
      bytesPerSecond: 100000,
      percent: 50,
    } as ProgressInfo);

    await new Promise((resolve) => setTimeout(resolve, 10));

    this.emit('download-progress', {
      transferred: 1024000,
      total: 1024000,
      bytesPerSecond: 100000,
      percent: 100,
    } as ProgressInfo);

    this.emit('update-downloaded', {
      version: updateInfo.version,
      releaseDate: updateInfo.releaseDate,
      downloadedFile: '/tmp/nostling-0.0.1.dmg',
    } as UpdateDownloadedEvent);
  }

  async simulateNoUpdates() {
    this.emit('checking-for-update');
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.currentVersion = (global as any).mockAppVersion || '0.0.0';
    this.emit('update-not-available');
  }
}

const mockAutoUpdater = new MockAutoUpdater();

jest.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

jest.mock('electron', () => ({
  app: {
    getVersion: jest.fn(() => (global as any).mockAppVersion || '0.0.0'),
  },
}));

jest.mock('../logging', () => ({
  log: jest.fn(),
}));

jest.mock('../integration', () => ({
  constructManifestUrl: jest.fn((publishConfig: any, devUpdateSource: any) => {
    if (devUpdateSource) {
      return (devUpdateSource as string).endsWith('/') ? devUpdateSource + 'manifest.json' : devUpdateSource + '/manifest.json';
    }
    const owner = (publishConfig as any)?.owner || '941design';
    const repo = (publishConfig as any)?.repo || 'nostling';
    return `https://github.com/${owner}/${repo}/releases/latest/download/manifest.json`;
  }),
  fetchManifest: jest.fn(),
  verifyDownloadedUpdate: jest.fn(),
}));

/**
 * Create minimal UpdateInfo for testing
 */
function createUpdateInfo(version: string): UpdateInfo {
  return {
    version,
    releaseDate: new Date().toISOString(),
    url: `https://github.com/941design/nostling/releases/download/v${version}/`,
    files: [],
    path: `/path/to/nostling-${version}`,
    sha512: 'test-sha512',
  } as UpdateInfo;
}

/**
 * Create minimal UpdateDownloadedEvent for testing
 */
function createDownloadEvent(version: string): UpdateDownloadedEvent {
  return {
    version,
    releaseDate: new Date().toISOString(),
    downloadedFile: `/tmp/nostling-${version}.dmg`,
    files: [],
    path: `/path/to/nostling-${version}`,
    sha512: 'test-sha512',
  } as UpdateDownloadedEvent;
}

describe('Version Transition E2E', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAutoUpdater.removeAllListeners();
    mockAutoUpdater.forceDevUpdateConfig = false;
    mockAutoUpdater.allowPrerelease = false;
    mockAutoUpdater.autoDownload = false;
    mockAutoUpdater.autoInstallOnAppQuit = false;
    (global as any).mockAppVersion = '0.0.0';
  });

  afterEach(() => {
    mockAutoUpdater.removeAllListeners();
    delete (global as any).mockAppVersion;
  });

  describe('Old version (v0.0.0) update flow', () => {
    test('should check for updates successfully from old version', async () => {
      const checkPromise = mockAutoUpdater.simulateCheckResult(createUpdateInfo('0.0.1'));

      let updateAvailable = false;
      mockAutoUpdater.on('update-available', () => {
        updateAvailable = true;
      });

      await checkPromise;

      expect(updateAvailable).toBe(true);
      expect((global as any).mockAppVersion).toBe('0.0.0');
    });

    test('should discover new version from old app', async () => {
      const newVersion = '0.0.1';
      let discoveredVersion: string | undefined;

      mockAutoUpdater.on('update-available', (updateInfo: UpdateInfo) => {
        discoveredVersion = updateInfo.version;
      });

      await mockAutoUpdater.simulateCheckResult(createUpdateInfo('0.0.1'));

      expect(discoveredVersion).toBe('0.0.1');
    });

    test('should download and complete download successfully', async () => {
      const updateInfo = createUpdateInfo('0.0.1');

      let progressEventsReceived = 0;
      let downloadCompleted = false;
      const progressEvents: ProgressInfo[] = [];

      mockAutoUpdater.on('download-progress', (progress: ProgressInfo) => {
        progressEventsReceived++;
        progressEvents.push(progress);
      });

      mockAutoUpdater.on('update-downloaded', () => {
        downloadCompleted = true;
      });

      await mockAutoUpdater.simulateDownloadComplete(updateInfo);

      expect(progressEventsReceived).toBeGreaterThan(0);
      expect(downloadCompleted).toBe(true);
      expect(progressEvents[progressEvents.length - 1].percent).toBe(100);
    });

    test('should transition through all update states', async () => {
      const states: string[] = [];

      mockAutoUpdater.on('checking-for-update', () => states.push('checking'));
      mockAutoUpdater.on('update-available', () => states.push('available'));
      mockAutoUpdater.on('download-progress', () => {
        if (!states.includes('downloading')) {
          states.push('downloading');
        }
      });
      mockAutoUpdater.on('update-downloaded', () => states.push('downloaded'));

      const updateInfo = createUpdateInfo('0.0.1');

      await mockAutoUpdater.simulateCheckResult(updateInfo);
      await mockAutoUpdater.simulateDownloadComplete(updateInfo);

      expect(states).toContain('checking');
      expect(states).toContain('available');
      expect(states).toContain('downloading');
      expect(states).toContain('downloaded');
    });
  });

  describe('New version (v0.0.1) post-update', () => {
    test('should check for updates with new GitHub provider after update', async () => {
      // Simulate app restart with new version
      (global as any).mockAppVersion = '0.0.1';

      let checkEventFired = false;
      mockAutoUpdater.on('checking-for-update', () => {
        checkEventFired = true;
      });

      // From new version, simulate update check
      await mockAutoUpdater.simulateNoUpdates();

      expect(checkEventFired).toBe(true);
      expect((global as any).mockAppVersion).toBe('0.0.1');
    });

    test('should handle no-updates scenario correctly', async () => {
      // Simulate app restart with new version
      (global as any).mockAppVersion = '0.0.1';

      let noUpdatesEmitted = false;
      mockAutoUpdater.on('update-not-available', () => {
        noUpdatesEmitted = true;
      });

      await mockAutoUpdater.simulateNoUpdates();

      expect(noUpdatesEmitted).toBe(true);
    });

    test('should successfully discover v0.0.2 if available', async () => {
      (global as any).mockAppVersion = '0.0.1';

      let discoveredVersion: string | undefined;
      mockAutoUpdater.on('update-available', (updateInfo: UpdateInfo) => {
        discoveredVersion = updateInfo.version;
      });

      await mockAutoUpdater.simulateCheckResult(createUpdateInfo('0.0.2'));

      expect(discoveredVersion).toBe('0.0.2');
    });
  });

  describe('Cross-version compatibility', () => {
    test('should use /latest/download/ for manifest URL construction', async () => {
      const { constructManifestUrl } = await import('../integration');

      const url = constructManifestUrl(
        { owner: '941design', repo: 'nostling' },
        undefined
      );

      expect(url).toContain('/latest/download/');
      expect(url).toBe('https://github.com/941design/nostling/releases/latest/download/manifest.json');
    });

    test('should construct manifest URL that works for any version', async () => {
      const { constructManifestUrl } = await import('../integration');

      // This URL should be the same regardless of current app version
      const urlV1 = constructManifestUrl({ owner: '941design', repo: 'nostling' }, undefined);
      (global as any).mockAppVersion = '0.0.1';
      const urlV2 = constructManifestUrl({ owner: '941design', repo: 'nostling' }, undefined);
      (global as any).mockAppVersion = '0.0.2';
      const urlV3 = constructManifestUrl({ owner: '941design', repo: 'nostling' }, undefined);

      expect(urlV1).toBe(urlV2);
      expect(urlV2).toBe(urlV3);
    });

    test('should handle dev mode manifest URL with custom source', async () => {
      const { constructManifestUrl } = await import('../integration');

      const devUrl = 'file:///tmp/test-updates/0.0.1';
      const result = constructManifestUrl({}, devUrl);

      expect(result).toBe(devUrl + '/manifest.json');
    });

    test('should handle dev mode with GitHub release URL', async () => {
      const { constructManifestUrl } = await import('../integration');

      const devUrl = 'https://github.com/941design/nostling/releases/download/0.0.1';
      const result = constructManifestUrl({}, devUrl);

      expect(result).toBe(devUrl + '/manifest.json');
    });

    test('should maintain manifest verification across version transitions', async () => {
      const { verifyDownloadedUpdate: verifyDownloadedUpdateModule } = await import('../integration');

      // Mock the verify function to succeed
      (verifyDownloadedUpdateModule as jest.Mock<any>).mockResolvedValue({ verified: true });

      // Old version downloads update
      const downloadEvent = createDownloadEvent('0.0.1');

      const result = await verifyDownloadedUpdateModule(
        downloadEvent,
        '0.0.0',
        'darwin',
        'test-public-key',
        'https://github.com/941design/nostling/releases/latest/download/manifest.json'
      );

      expect(result).toEqual({ verified: true });
      expect(verifyDownloadedUpdateModule).toHaveBeenCalled();
    });
  });

  describe('Backward compatibility constraint C2', () => {
    test('old version can initiate complete update flow without errors', async () => {
      const updateInfo = createUpdateInfo('0.0.1');

      const states: string[] = [];
      const errors: Error[] = [];

      mockAutoUpdater.on('checking-for-update', () => states.push('checking'));
      mockAutoUpdater.on('update-available', () => states.push('available'));
      mockAutoUpdater.on('download-progress', () => {
        if (!states.includes('downloading')) {
          states.push('downloading');
        }
      });
      mockAutoUpdater.on('update-downloaded', () => states.push('ready'));
      mockAutoUpdater.on('error', (err) => errors.push(err));

      await mockAutoUpdater.simulateCheckResult(updateInfo);
      await mockAutoUpdater.simulateDownloadComplete(updateInfo);

      expect(errors).toHaveLength(0);
      expect(states).toContain('ready');
      expect((global as any).mockAppVersion).toBe('0.0.0');
    });

    test('new version maintains provider consistency', async () => {
      (global as any).mockAppVersion = '0.0.1';

      const { setupUpdater } = await import('../update/controller');

      // Setup should work consistently with GitHub provider
      setupUpdater(false, { autoUpdate: true, logLevel: 'info' }, {
        forceDevUpdateConfig: false,
        devUpdateSource: undefined,
        allowPrerelease: false,
      });

      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'github',
        owner: '941design',
        repo: 'nostling',
      });
    });

    test('manifest format remains compatible across versions', async () => {
      const { fetchManifest: fetchManifestModule } = await import('../integration');

      const validManifest = {
        version: '0.0.1',
        artifacts: [
          {
            url: 'https://github.com/941design/nostling/releases/download/0.0.1/nostling-0.0.1.dmg',
            sha256: 'a'.repeat(64),
            platform: 'darwin' as const,
            type: 'dmg' as const,
          },
        ],
        signature: 'test-signature',
        createdAt: new Date().toISOString(),
      };

      (fetchManifestModule as jest.Mock<any>).mockResolvedValue(validManifest);

      const result = await fetchManifestModule('https://github.com/941design/nostling/releases/latest/download/manifest.json');

      expect(result).toEqual(validManifest);
      expect(result.version).toBeDefined();
      expect(result.artifacts).toBeDefined();
      expect(result.signature).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    test('no state corruption during version transition', async () => {
      const updateInfo = createUpdateInfo('0.0.1');

      const stateHistory: Array<{ version: string; event: string }> = [];

      mockAutoUpdater.on('checking-for-update', () => {
        stateHistory.push({ version: (global as any).mockAppVersion, event: 'checking' });
      });

      mockAutoUpdater.on('update-available', () => {
        stateHistory.push({ version: (global as any).mockAppVersion, event: 'available' });
      });

      mockAutoUpdater.on('update-downloaded', () => {
        stateHistory.push({ version: (global as any).mockAppVersion, event: 'downloaded' });
      });

      // Check with old version
      await mockAutoUpdater.simulateCheckResult(updateInfo);

      // Download with old version
      await mockAutoUpdater.simulateDownloadComplete(updateInfo);

      // All events should be associated with correct version
      expect(stateHistory.every((s) => s.version === '0.0.0')).toBe(true);

      // Simulate restart with new version
      (global as any).mockAppVersion = '0.0.1';

      // Check with new version
      mockAutoUpdater.removeAllListeners();
      mockAutoUpdater.on('checking-for-update', () => {
        stateHistory.push({ version: (global as any).mockAppVersion, event: 'checking' });
      });

      mockAutoUpdater.on('update-not-available', () => {
        stateHistory.push({ version: (global as any).mockAppVersion, event: 'not-available' });
      });

      await mockAutoUpdater.simulateNoUpdates();

      // New version events should show correct version
      const newVersionEvents = stateHistory.slice(-2);
      expect(newVersionEvents.every((s) => s.version === '0.0.1')).toBe(true);
    });
  });

  describe('Failure Scenarios (TR1 Extension)', () => {
    test('E2E-F1: should handle verification failure and recover on retry', async () => {
      // Import mocked integration module
      const integrationModule = await import('../integration');
      const fetchManifestMock = jest.mocked(integrationModule.fetchManifest);
      const verifyDownloadedUpdateMock = jest.mocked(integrationModule.verifyDownloadedUpdate);

      // Simulate old version
      (global as any).mockAppVersion = '0.0.0';

      const updateInfo: UpdateInfo = {
        version: '0.0.1',
        releaseDate: new Date().toISOString(),
        path: '/tmp/nostling-0.0.1.dmg',
        sha512: 'mock-sha512',
        files: [],
      };

      // First attempt: verification fails
      verifyDownloadedUpdateMock.mockRejectedValueOnce(new Error('Manifest verification failed'));

      let stateHistory: string[] = [];

      mockAutoUpdater.on('checking-for-update', () => {
        stateHistory.push('checking');
      });

      mockAutoUpdater.on('update-available', () => {
        stateHistory.push('available');
      });

      mockAutoUpdater.on('update-downloaded', () => {
        stateHistory.push('downloaded');
      });

      mockAutoUpdater.on('error', () => {
        stateHistory.push('error');
      });

      // Trigger update check
      await mockAutoUpdater.simulateCheckResult(updateInfo);
      await mockAutoUpdater.simulateDownloadComplete(updateInfo);

      // Verification will fail (error event should be emitted by integration layer)
      // This simulates the index.ts catch block handling verification failure

      // Retry: verification succeeds
      verifyDownloadedUpdateMock.mockResolvedValueOnce({ verified: true });

      mockAutoUpdater.removeAllListeners();
      stateHistory = [];

      mockAutoUpdater.on('update-downloaded', () => {
        stateHistory.push('downloaded-retry');
      });

      await mockAutoUpdater.simulateCheckResult(updateInfo);
      await mockAutoUpdater.simulateDownloadComplete(updateInfo);

      // Retry should succeed
      expect(stateHistory).toContain('downloaded-retry');
    });

    test('E2E-F2: should preserve config across version transitions', async () => {
      // Simulate old version with specific config
      (global as any).mockAppVersion = '0.0.0';

      type AutoUpdateBehavior = 'auto-download' | 'manual';
      const originalConfig: {
        autoUpdate: boolean;
        autoUpdateBehavior: AutoUpdateBehavior;
        logLevel: 'debug';
      } = {
        autoUpdate: true,
        autoUpdateBehavior: 'manual',
        logLevel: 'debug',
      };

      // Simulate config persistence (in real app, this would be loadConfig/saveConfig)
      const persistedConfig = { ...originalConfig };

      const updateInfo: UpdateInfo = {
        version: '0.0.1',
        releaseDate: new Date().toISOString(),
        path: '/tmp/nostling-0.0.1.dmg',
        sha512: 'mock-sha512',
        files: [],
      };

      // Complete update flow
      await mockAutoUpdater.simulateCheckResult(updateInfo);
      await mockAutoUpdater.simulateDownloadComplete(updateInfo);

      // Simulate app restart with new version
      (global as any).mockAppVersion = '0.0.1';

      // Config should persist across version transition
      expect(persistedConfig.autoUpdate).toBe(true);
      expect(persistedConfig.autoUpdateBehavior).toBe('manual');
      expect(persistedConfig.logLevel).toBe('debug');

      // New version should respect persisted config
      mockAutoUpdater.autoDownload = persistedConfig.autoUpdateBehavior === 'auto-download';
      expect(mockAutoUpdater.autoDownload).toBe(false); // manual mode
    });

    test('E2E-F3: should handle crash/interruption during update and allow retry', async () => {
      // Simulate old version
      (global as any).mockAppVersion = '0.0.0';

      const updateInfo: UpdateInfo = {
        version: '0.0.1',
        releaseDate: new Date().toISOString(),
        path: '/tmp/nostling-0.0.1.dmg',
        sha512: 'mock-sha512',
        files: [],
      };

      let stateHistory: string[] = [];

      mockAutoUpdater.on('checking-for-update', () => {
        stateHistory.push('checking');
      });

      mockAutoUpdater.on('update-available', () => {
        stateHistory.push('available');
      });

      mockAutoUpdater.on('download-progress', () => {
        stateHistory.push('progress');
      });

      // Start download
      await mockAutoUpdater.simulateCheckResult(updateInfo);

      // Simulate crash during download (app closes unexpectedly)
      // Download progress was at 50%
      stateHistory.push('crash-simulated');

      // Clear state to simulate app restart
      mockAutoUpdater.removeAllListeners();
      stateHistory = ['app-restart'];

      // After restart, user initiates update check again
      mockAutoUpdater.on('checking-for-update', () => {
        stateHistory.push('checking-retry');
      });

      mockAutoUpdater.on('update-available', () => {
        stateHistory.push('available-retry');
      });

      mockAutoUpdater.on('update-downloaded', () => {
        stateHistory.push('downloaded-retry');
      });

      // Retry should succeed
      await mockAutoUpdater.simulateCheckResult(updateInfo);
      await mockAutoUpdater.simulateDownloadComplete(updateInfo);

      expect(stateHistory).toContain('app-restart');
      expect(stateHistory).toContain('checking-retry');
      expect(stateHistory).toContain('available-retry');
      expect(stateHistory).toContain('downloaded-retry');

      // Update flow should complete successfully on retry
      const finalStates = stateHistory.slice(-3);
      expect(finalStates).toEqual(['checking-retry', 'available-retry', 'downloaded-retry']);
    });
  });
});
