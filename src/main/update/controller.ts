/**
 * GAP-005, GAP-009: Update control with manual download and progress tracking
 *
 * This module manages the update lifecycle with user control over downloads.
 * Replaces automatic download with user-initiated download after approval.
 */

import { autoUpdater } from 'electron-updater';
import { DownloadProgress, AppConfig } from '../../shared/types';
import { DevUpdateConfig } from '../dev-env';
import { log } from '../logging';
import { validateUpdateUrl } from './url-validation';

/**
 * FR5: GitHub repository constants (single source of truth)
 */
export const GITHUB_OWNER = '941design';
export const GITHUB_REPO = 'nostling';

/**
 * Setup autoUpdater with manual download configuration and dev mode support
 *
 * CONTRACT:
 *   Inputs:
 *     - autoDownloadEnabled: boolean, true for automatic download, false for manual
 *     - config: AppConfig object with optional dev fields:
 *       - forceDevUpdateConfig: boolean or undefined
 *       - devUpdateSource: string (URL or file:// path) or undefined
 *       - allowPrerelease: boolean or undefined
 *     - devConfig: DevUpdateConfig object from environment:
 *       - forceDevUpdateConfig: boolean (from env vars)
 *       - devUpdateSource: string or undefined (from env vars)
 *       - allowPrerelease: boolean (from env vars)
 *
 *   Outputs:
 *     - void (side effect: configures autoUpdater instance)
 *
 *   Invariants:
 *     - autoUpdater.autoDownload set to autoDownloadEnabled
 *     - autoUpdater.autoInstallOnAppQuit set to true (triggers Squirrel.Mac verification during download, not on restart)
 *     - Production mode: use GitHub provider with owner/repo configuration
 *     - Dev mode with devUpdateSource: use generic provider for file:// URL support
 *     - In production builds: forceDevUpdateConfig and allowPrerelease NEVER enabled (constraint C1)
 *     - Environment variables take precedence over config file for dev settings
 *     - Config file values used as fallback when env vars not set
 *
 *   Properties:
 *     - Production safety: dev features disabled when devConfig indicates production mode
 *     - Precedence: env vars (devConfig) > config file (config) > defaults
 *     - Security preservation: all verification still required (constraint C2)
 *     - Backward compatibility: existing production flow unchanged when no dev config (constraint C3)
 *
 *   Algorithm:
 *     1. Set basic autoUpdater configuration (autoDownload, autoInstallOnAppQuit)
 *
 *     2. Determine effective dev mode settings (precedence: env > config > default):
 *        a. isDevModeActive = devConfig.forceDevUpdateConfig OR Boolean(devConfig.devUpdateSource) OR devConfig.allowPrerelease
 *        b. forceDevUpdateConfig = devConfig.forceDevUpdateConfig OR (isDevModeActive AND config.forceDevUpdateConfig) OR false
 *        c. devUpdateSource = devConfig.devUpdateSource OR (isDevModeActive AND config.devUpdateSource) OR undefined
 *        d. allowPrerelease = devConfig.allowPrerelease OR (isDevModeActive AND config.allowPrerelease) OR false
 *
 *     3. Configure forceDevUpdateConfig:
 *        - Set autoUpdater.forceDevUpdateConfig to effective value
 *        - Log if enabled for diagnostics (FR5)
 *
 *     4. Configure allowPrerelease:
 *        - Set autoUpdater.allowPrerelease to effective value
 *        - Log if enabled for diagnostics (FR5)
 *
 *     5. Configure feed URL based on mode:
 *        IF devUpdateSource is set:
 *          // Dev mode: use generic provider for file:// URL support
 *          autoUpdater.setFeedURL({
 *            provider: 'generic',
 *            url: devUpdateSource
 *          })
 *          log('info', `Dev mode: using custom update source: ${devUpdateSource}`)
 *        ELSE:
 *          // Production mode: use GitHub provider
 *          autoUpdater.setFeedURL({
 *            provider: 'github',
 *            owner: '941design',
 *            repo: 'nostling'
 *          })
 *          log('info', 'Update feed configured: GitHub provider (941design/nostling)')
 *
 *   Examples:
 *     Production mode (devConfig all false/undefined):
 *       - Result: GitHub provider, no dev features enabled
 *
 *     Dev mode with GitHub releases:
 *       - devConfig = { forceDevUpdateConfig: true, devUpdateSource: "https://github.com/941design/nostling/releases/download/1.0.0", allowPrerelease: false }
 *       - Result: Force dev updates, generic provider with specified GitHub release, no prereleases
 *
 *     Dev mode with local manifest:
 *       - devConfig = { forceDevUpdateConfig: true, devUpdateSource: "file://./test-manifests/1.0.0", allowPrerelease: true }
 *       - Result: Force dev updates, generic provider with local file, allow prereleases
 *
 *     Dev mode with env override:
 *       - config = { forceDevUpdateConfig: false }
 *       - devConfig = { forceDevUpdateConfig: true, ... }
 *       - Result: Env var wins, force dev updates enabled
 *
 *   Error Handling:
 *     - Invalid URLs: Passed to autoUpdater as-is (will fail gracefully per FR4)
 *     - Missing manifest: autoUpdater will transition to 'failed' state (FR4)
 *     - Network errors: Handled by autoUpdater event system (FR4)
 */
export function setupUpdater(
  autoDownloadEnabled: boolean,
  config: AppConfig,
  devConfig: DevUpdateConfig
): void {
  autoUpdater.autoDownload = autoDownloadEnabled;

  // BUG FIX: Enable autoInstallOnAppQuit to trigger Squirrel verification during download
  // Root cause: autoInstallOnAppQuit=false delays Squirrel.Mac signature verification until
  //             quitAndInstall() is called. This causes verification to fail AFTER user clicks
  //             "Restart to Update" because Squirrel.Mac expects Apple Developer signed apps
  //             but finds ad-hoc signed apps (identity=null in package.json).
  // Fix: autoInstallOnAppQuit=true triggers Squirrel.Mac verification during download phase.
  //      If Squirrel accepts ad-hoc signed apps, installation proceeds normally.
  //      If Squirrel rejects ad-hoc signed apps, error surfaces early during download
  //      (not after user clicks restart), providing better fail-fast behavior.
  // Bug report: bug-reports/0015-update-signature-verification-after-restart-report.md
  // Fixed: 2025-12-08
  autoUpdater.autoInstallOnAppQuit = true;

  if (process.platform === 'darwin') {
    log('info', 'macOS code signing: identity=null (unsigned), autoInstallOnAppQuit=true for early Squirrel.Mac verification');
  }

  // CRITICAL: Production safety (C1) - config values ONLY used when devConfig indicates dev mode
  const isDevModeActive = devConfig.forceDevUpdateConfig || Boolean(devConfig.devUpdateSource) || devConfig.allowPrerelease;

  const forceDevUpdateConfig = devConfig.forceDevUpdateConfig || (isDevModeActive && config.forceDevUpdateConfig) || false;
  const devUpdateSource = devConfig.devUpdateSource || (isDevModeActive && config.devUpdateSource) || undefined;
  const allowPrerelease = devConfig.allowPrerelease || (isDevModeActive && config.allowPrerelease) || false;

  autoUpdater.forceDevUpdateConfig = forceDevUpdateConfig;
  if (forceDevUpdateConfig) {
    log('info', 'Dev mode: forceDevUpdateConfig enabled');
  }

  autoUpdater.allowPrerelease = allowPrerelease;
  if (allowPrerelease) {
    log('info', 'Dev mode: allowPrerelease enabled');
  }

  // FR3: URL Validation Before setFeedURL (fail-fast behavior)
  // Validate devUpdateSource URL before passing to setFeedURL to catch configuration errors early
  if (devUpdateSource) {
    try {
      validateUpdateUrl(devUpdateSource, {
        allowFileProtocol: true, // Dev mode allows file://
        allowHttp: true,         // Dev mode allows http://
        context: 'devUpdateSource',
      });
      log('info', `Validated devUpdateSource URL: ${devUpdateSource.trim()}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log('error', error);
      throw err instanceof Error ? err : new Error(error);
    }
  }

  // Configure feed URL based on mode
  if (devUpdateSource) {
    // Dev mode: use generic provider for file:// URL support
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: devUpdateSource,
    });
    log('info', `Dev mode: using custom update source: ${devUpdateSource}`);
  } else {
    // Production mode: use GitHub provider
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
    });
    log('info', `Update feed configured: GitHub provider (${GITHUB_OWNER}/${GITHUB_REPO})`);
  }
}

/**
 * Trigger manual download of available update
 *
 * CONTRACT (FR1: Download Concurrency Protection):
 *   Inputs:
 *     - none (operates on autoUpdater global state and module-level guard)
 *
 *   Outputs:
 *     - promise resolving to void when download completes successfully
 *     - promise rejecting with Error if download fails or already in progress
 *
 *   Invariants:
 *     - Only one download operation can be active at a time
 *     - Download guard is released after completion (success or failure)
 *     - Should only be called when update is available
 *     - Download progress events emitted during download
 *
 *   Properties:
 *     - Concurrency protection: second concurrent call rejects immediately
 *     - Guard cleanup: guard always released via finally block
 *     - Asynchronous: returns promise for completion
 *     - Error propagation: underlying errors propagated after guard cleanup
 *
 *   Algorithm:
 *     1. Check download-in-progress guard (module-level boolean flag):
 *        - If guard is true (download active), throw Error("Download already in progress")
 *     2. Set guard to true (claim download slot)
 *     3. Try block:
 *        a. Call autoUpdater.downloadUpdate()
 *        b. Await completion
 *     4. Finally block (always executes):
 *        a. Set guard to false (release download slot)
 *
 *   Concurrency Examples:
 *     Sequential calls:
 *       - Call 1: guard = false → set to true → download → set to false → resolve
 *       - Call 2 (after Call 1): guard = false → set to true → download → success
 *       Result: Both succeed
 *
 *     Concurrent calls:
 *       - Call 1: guard = false → set to true → downloading...
 *       - Call 2 (during Call 1): guard = true → reject immediately
 *       Result: Call 1 succeeds, Call 2 rejects with "Download already in progress"
 *
 *   Error Conditions:
 *     - Concurrent download: reject with "Download already in progress"
 *     - No update available: propagate autoUpdater error after guard cleanup
 *     - Network failure: propagate network error after guard cleanup
 *     - Disk space insufficient: propagate filesystem error after guard cleanup
 *
 * IMPLEMENTATION NOTE:
 *   Pattern should match existing checkForUpdates concurrency guard (if present).
 *   Guard variable should be module-level (shared across all calls).
 *   Use try/finally to ensure guard cleanup even on exceptions.
 */
// Module-level concurrency guard for download operations
let downloadInProgress = false;

export async function downloadUpdate(): Promise<void> {
  if (downloadInProgress) {
    throw new Error('Download already in progress');
  }

  downloadInProgress = true;

  try {
    await autoUpdater.downloadUpdate();
  } finally {
    downloadInProgress = false;
  }
}
