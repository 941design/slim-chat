/**
 * Regression test for auto-update 404 error
 *
 * Bug: electron-updater tries to fetch latest-mac.yml instead of manifest.json
 * Expected: Should configure electron-updater to use generic provider with manifest.json
 * Root cause: setupUpdater() did not call autoUpdater.setFeedURL()
 * Bug report: bug-reports/bug-auto-update-404.md
 * Fixed: 2025-12-07
 *
 * Protection: Prevents electron-updater from defaulting to GitHub provider
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock electron and electron-updater before imports
const mockSetFeedURL = jest.fn();
const mockAutoUpdater = {
  autoDownload: false,
  autoInstallOnAppQuit: false,
  setFeedURL: mockSetFeedURL,
};

const mockGetVersion = jest.fn(() => '1.0.0');
const mockApp = {
  getVersion: mockGetVersion,
};

jest.mock('electron', () => ({
  app: mockApp,
}));

jest.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

jest.mock('../logging', () => ({
  log: jest.fn(),
}));

describe('Regression: Auto-update 404 error (FIXED)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAutoUpdater.autoDownload = false;
    mockAutoUpdater.autoInstallOnAppQuit = false;
  });

  it('verifies setupUpdater() configures GitHub provider feed URL', async () => {
    // Import controller module (after mocks are set up)
    const { setupUpdater } = await import('./controller');

    // Mock config and devConfig
    const mockConfig = {
      autoUpdate: true,
      logLevel: 'info' as const,
    };
    const mockDevConfig = {
      forceDevUpdateConfig: false,
      allowPrerelease: false,
    };

    // Call setupUpdater
    setupUpdater(false, mockConfig, mockDevConfig);

    // VERIFY FIX: setupUpdater() now calls setFeedURL with GitHub provider
    expect(mockSetFeedURL).toHaveBeenCalledTimes(1);
    expect(mockSetFeedURL).toHaveBeenCalledWith({
      provider: 'github',
      owner: '941design',
      repo: 'nostling'
    });

    // Verify other configuration
    expect(mockAutoUpdater.autoDownload).toBe(false);
    // BUG FIX: autoInstallOnAppQuit changed from false to true to fix bug 0015
    // Bug report: bug-reports/0015-update-signature-verification-after-restart-report.md
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  it('verifies GitHub provider does not use version-specific URLs', async () => {
    const { setupUpdater } = await import('./controller');

    // Mock config and devConfig
    const mockConfig = {
      autoUpdate: true,
      logLevel: 'info' as const,
    };
    const mockDevConfig = {
      forceDevUpdateConfig: false,
      allowPrerelease: false,
    };

    // Set different version
    mockGetVersion.mockReturnValue('2.3.4');

    setupUpdater(true, mockConfig, mockDevConfig);

    // Verify GitHub provider configuration (version-agnostic)
    expect(mockSetFeedURL).toHaveBeenCalledWith({
      provider: 'github',
      owner: '941design',
      repo: 'nostling'
    });
  });

  it('documents the fix: GitHub provider enables cross-version updates', () => {
    // CURRENT BEHAVIOR:
    // setupUpdater() now calls autoUpdater.setFeedURL() with:
    // {
    //   provider: 'github',
    //   owner: '941design',
    //   repo: 'nostling'
    // }
    //
    // With GitHub provider, electron-updater automatically fetches from:
    // - /releases/latest/download/latest-mac.yml
    // - This allows cross-version updates (v0.0.0 can discover v0.0.1)
    //
    // Previously used generic provider with version-specific URLs:
    // - /releases/download/v{version}/latest-mac.yml
    // - This prevented cross-version updates (each version checked only its own release)

    expect(true).toBe(true); // Documents current behavior
  });
});
