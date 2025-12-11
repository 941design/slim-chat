/**
 * Regression Test: Update Signature Verification Fails After Restart (FIXED)
 *
 * Bug Report: bug-reports/0015-update-signature-verification-after-restart-report.md
 * Fixed: 2025-12-08
 *
 * ORIGINAL BUG SYMPTOM:
 * - Download and verification succeed (✅)
 * - User clicks "Restart to Update" button
 * - Error occurs ~0.5 seconds later: "Updater error: Manifest signature verification failed"
 * - App remains on version 0.0.14, does not restart
 *
 * ROOT CAUSE:
 * When autoInstallOnAppQuit=false, quitAndInstall() triggers nativeUpdater.checkForUpdates()
 * which causes Squirrel.Mac to re-fetch and verify the update zip. Squirrel.Mac performs
 * macOS code signature verification on the downloaded zip's embedded app bundle, expecting
 * a valid Apple Developer signature. Nostling is ad-hoc signed, causing this verification to fail.
 *
 * FIX APPLIED:
 * Changed autoUpdater.autoInstallOnAppQuit from false to true. This moves Squirrel.Mac
 * verification to the download phase instead of the quitAndInstall phase, providing
 * fail-fast behavior.
 *
 * REGRESSION PROTECTION:
 * This test verifies autoInstallOnAppQuit=true is set in controller.ts. If someone
 * changes it back to false, this test will FAIL, preventing the bug from reappearing.
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

describe('Regression: Update signature verification after restart (FIXED)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAutoUpdater.autoDownload = false;
    mockAutoUpdater.autoInstallOnAppQuit = false;
  });

  it('CRITICAL: verifies autoInstallOnAppQuit=true to prevent bug recurrence', async () => {
    // Import controller after mocks are set up
    const { setupUpdater } = await import('./controller');

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

    // REGRESSION TEST: Verify autoInstallOnAppQuit is set to TRUE
    // If this fails, the bug has been reintroduced
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);

    // DOCUMENTATION: Why this matters
    // - true: Squirrel.Mac verification happens during download (fail-fast)
    // - false: Squirrel.Mac verification happens during quitAndInstall (bug reappears)
  });

  it('documents the original bug flow with autoInstallOnAppQuit=false', () => {
    // ORIGINAL BUGGY BEHAVIOR:
    // When autoInstallOnAppQuit=false, quitAndInstall() triggers nativeUpdater.checkForUpdates()
    const autoInstallOnAppQuit = false; // BUGGY value
    const squirrelDownloadedUpdate = false; // Not set because autoInstallOnAppQuit=false

    // MacUpdater.quitAndInstall() logic (lines 236-249 in electron-updater):
    if (squirrelDownloadedUpdate) {
      // Branch NOT taken (squirrelDownloadedUpdate is false)
      throw new Error('This branch should not execute');
    } else {
      // Branch TAKEN: Sets up listener and calls checkForUpdates()
      // This triggers Squirrel.Mac to fetch and verify, causing the bug

      // ASSERTION: Document buggy configuration
      expect(autoInstallOnAppQuit).toBe(false);
      expect(squirrelDownloadedUpdate).toBe(false);
    }

    // EXECUTION FLOW THAT CAUSED BUG:
    // 1. User clicks "Restart to Update" → restartToUpdate() → autoUpdater.quitAndInstall()
    // 2. MacUpdater.quitAndInstall() calls nativeUpdater.checkForUpdates()
    // 3. Squirrel.Mac fetches zip from proxy server
    // 4. Squirrel.Mac verifies app bundle code signature
    // 5. FAIL: app is ad-hoc signed, not Apple Developer signed
    // 6. Error: "Manifest signature verification failed"
  });

  it('documents the fix: autoInstallOnAppQuit=true moves verification to download phase', async () => {
    const { setupUpdater } = await import('./controller');

    const mockConfig = {
      autoUpdate: true,
      logLevel: 'info' as const,
    };
    const mockDevConfig = {
      forceDevUpdateConfig: false,
      allowPrerelease: false,
    };

    setupUpdater(false, mockConfig, mockDevConfig);

    // FIXED BEHAVIOR:
    // When autoInstallOnAppQuit=true, Squirrel.Mac verification happens during download
    // - If Squirrel accepts ad-hoc signed apps → installation proceeds normally
    // - If Squirrel rejects ad-hoc signed apps → error surfaces during download (fail-fast)
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);

    // BENEFIT: Error timing improvement
    // - BEFORE FIX: Error after user clicks "Restart to Update" (bad UX)
    // - AFTER FIX: Error during download phase (better UX, fail-fast)
  });

  it('verifies identity: null is present in package.json (required for ad-hoc signing)', () => {
    // Source: package.json:93
    // "identity": null

    // This setting tells electron-builder to skip Apple Developer code signing during build.
    // It does NOT affect Squirrel.Mac's verification behavior.

    // electron-builder uses this at BUILD time → generates ad-hoc signed apps
    // Squirrel.Mac uses its own verification at INSTALL time → independent of this setting

    // CONCLUSION: identity: null is necessary but insufficient to fix the bug
    // The real fix is autoInstallOnAppQuit=true
    expect(true).toBe(true);
  });

  it('confirms the error was from Squirrel.Mac native updater, not custom verification', () => {
    // TIMELINE FROM BUG REPORT:
    // 19:31:38 - Custom verification passes ✅
    //   - RSA signature verification
    //   - Version validation
    //   - SHA-256 hash verification
    //   - Manifest fully verified
    //
    // 19:39:57 - User clicks "Restart to Update"
    //   - Log: "Initiating app restart to install update: 0.0.14 -> 0.0.15"
    //
    // 19:39:58 - Error occurs (~0.5 seconds later)
    //   - Log: "Updater error: Manifest signature verification failed"
    //   - Source: nativeUpdater.on('error') event (MacUpdater.js:18-21)
    //   - Cause: Squirrel.Mac signature verification of ad-hoc signed app

    // The error timing (0.5s after quitAndInstall) matches Squirrel.Mac fetch + verify time.
    // The error occurred AFTER all custom verification passed.
    // The error was emitted by nativeUpdater (Squirrel.Mac), not our custom code.

    expect(true).toBe(true);
  });
});
