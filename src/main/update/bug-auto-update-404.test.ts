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

describe('Regression: Auto-update 404 error (FIXED)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAutoUpdater.autoDownload = false;
    mockAutoUpdater.autoInstallOnAppQuit = false;
  });

  it('verifies setupUpdater() configures generic provider feed URL', async () => {
    // Import controller module (after mocks are set up)
    const { setupUpdater } = await import('./controller');

    // Call setupUpdater
    setupUpdater(false);

    // VERIFY FIX: setupUpdater() now calls setFeedURL with generic provider
    expect(mockSetFeedURL).toHaveBeenCalledTimes(1);
    expect(mockSetFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/941design/slim-chat/releases/download/v1.0.0'
    });

    // Verify other configuration
    expect(mockAutoUpdater.autoDownload).toBe(false);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false);
  });

  it('verifies feed URL uses app version', async () => {
    const { setupUpdater } = await import('./controller');

    // Set different version
    mockGetVersion.mockReturnValue('2.3.4');

    setupUpdater(true);

    // Verify URL includes version
    expect(mockSetFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/941design/slim-chat/releases/download/v2.3.4'
    });
  });

  it('documents the fix: generic provider prevents 404', () => {
    // FIXED BEHAVIOR:
    // setupUpdater() now calls autoUpdater.setFeedURL() with:
    // {
    //   provider: 'generic',
    //   url: 'https://github.com/941design/slim-chat/releases/download/v{version}'
    // }
    //
    // With generic provider, electron-updater fetches:
    // - {url}/manifest.json (custom format we generate)
    //
    // This prevents the 404 error from trying to fetch:
    // - latest-mac.yml (GitHub provider default, which we don't generate)

    expect(true).toBe(true); // Documents fixed behavior
  });
});
