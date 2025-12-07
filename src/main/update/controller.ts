/**
 * GAP-005, GAP-009: Update control with manual download and progress tracking
 *
 * This module manages the update lifecycle with user control over downloads.
 * Replaces automatic download with user-initiated download after approval.
 */

import { app } from 'electron';
import { autoUpdater, ProgressInfo } from 'electron-updater';
import { UpdateState, DownloadProgress } from '../../shared/types';

/**
 * Convert electron-updater ProgressInfo to DownloadProgress
 *
 * CONTRACT:
 *   Inputs:
 *     - progressInfo: object from electron-updater with fields:
 *       - total: total bytes to download (number, may be 0 if unknown)
 *       - transferred: bytes downloaded so far (number, non-negative)
 *       - bytesPerSecond: download speed (number, non-negative)
 *       - percent: completion percentage (number, 0-100)
 *
 *   Outputs:
 *     - DownloadProgress object with fields:
 *       - percent: number, 0-100
 *       - bytesPerSecond: number, non-negative
 *       - transferred: number, non-negative
 *       - total: number, non-negative
 *
 *   Invariants:
 *     - transferred ≤ total (if total is known)
 *     - percent is clamped to 0-100 range
 *     - All numeric fields non-negative
 *
 *   Properties:
 *     - Bounded: percent is in [0, 100]
 *     - Monotonic: transferred never decreases during download
 *     - Complete: when percent = 100, transferred = total
 *
 *   Algorithm:
 *     1. Extract fields from progressInfo
 *     2. Clamp percent to range [0, 100]:
 *        - If percent < 0, use 0
 *        - If percent > 100, use 100
 *        - Otherwise use progressInfo.percent
 *     3. Return DownloadProgress object with clamped values
 */
export function convertProgress(progressInfo: ProgressInfo): DownloadProgress {
  // TRIVIAL: Implemented directly
  return {
    percent: Math.max(0, Math.min(100, progressInfo.percent)),
    bytesPerSecond: progressInfo.bytesPerSecond,
    transferred: progressInfo.transferred,
    total: progressInfo.total,
  };
}

/**
 * Format bytes as human-readable string
 *
 * CONTRACT:
 *   Inputs:
 *     - bytes: non-negative integer, number of bytes
 *
 *   Outputs:
 *     - string: formatted with appropriate unit (B, KB, MB, GB)
 *
 *   Invariants:
 *     - Uses 1024-based units (binary: KiB, MiB, GiB)
 *     - 1-2 decimal places for values ≥ 1 KB
 *     - No decimal places for bytes
 *
 *   Properties:
 *     - Monotonic: larger byte values produce larger numeric prefixes
 *     - Readable: uses appropriate unit for magnitude
 *
 *   Algorithm:
 *     1. If bytes < 1024, return "{bytes} B"
 *     2. If bytes < 1024^2, return "{bytes/1024:.1f} KB"
 *     3. If bytes < 1024^3, return "{bytes/1024^2:.1f} MB"
 *     4. Otherwise, return "{bytes/1024^3:.2f} GB"
 *
 *   Examples:
 *     - formatBytes(512) → "512 B"
 *     - formatBytes(1536) → "1.5 KB"
 *     - formatBytes(2097152) → "2.0 MB"
 *     - formatBytes(5368709120) → "5.00 GB"
 */
export function formatBytes(bytes: number): string {
  const normalized = Math.max(0, Math.floor(bytes));

  if (normalized < 1024) {
    return `${normalized} B`;
  }

  if (normalized < 1024 * 1024) {
    return `${(normalized / 1024).toFixed(1)} KB`;
  }

  if (normalized < 1024 * 1024 * 1024) {
    return `${(normalized / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(normalized / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Setup autoUpdater with manual download configuration
 *
 * CONTRACT:
 *   Inputs:
 *     - autoDownloadEnabled: boolean, true for automatic download, false for manual
 *
 *   Outputs:
 *     - void (side effect: configures autoUpdater instance)
 *
 *   Invariants:
 *     - autoUpdater.autoDownload set to autoDownloadEnabled
 *     - autoUpdater.autoInstallOnAppQuit always false (user must restart manually)
 *     - autoUpdater.setFeedURL configured for generic provider
 *
 *   Properties:
 *     - Configuration persistence: settings remain until next call
 *     - User control: when autoDownload false, download requires explicit trigger
 *
 *   Algorithm:
 *     1. Set autoUpdater.autoDownload to autoDownloadEnabled
 *     2. Set autoUpdater.autoInstallOnAppQuit to false
 *     3. Configure feed URL for generic provider
 */
export function setupUpdater(autoDownloadEnabled: boolean): void {
  // TRIVIAL: Implemented directly
  autoUpdater.autoDownload = autoDownloadEnabled;
  autoUpdater.autoInstallOnAppQuit = false;

  // BUG FIX: Configure electron-updater to use generic provider
  // Root cause: Without setFeedURL(), electron-updater defaults to GitHub provider
  //             which expects latest-mac.yml at /latest, causing 404 errors
  // Bug report: bug-reports/bug-auto-update-404.md
  // Fixed: 2025-12-07
  const owner = '941design';
  const repo = 'slim-chat';
  const version = app.getVersion();
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: `https://github.com/${owner}/${repo}/releases/download/v${version}`
  });
}

/**
 * Trigger manual download of available update
 *
 * CONTRACT:
 *   Inputs:
 *     - none (operates on autoUpdater global state)
 *
 *   Outputs:
 *     - promise resolving when download completes
 *     - promise rejecting if download fails
 *
 *   Invariants:
 *     - Should only be called when update is available
 *     - Download progress events emitted during download
 *
 *   Properties:
 *     - Idempotent: calling multiple times starts only one download
 *     - Asynchronous: returns promise for completion
 *
 *   Algorithm:
 *     1. Call autoUpdater.downloadUpdate()
 *     2. Await completion
 *     3. Return promise result
 *
 *   Error Conditions:
 *     - No update available: reject with updater error
 *     - Network failure: reject with network error
 *     - Disk space insufficient: reject with filesystem error
 */
export async function downloadUpdate(): Promise<void> {
  // TRIVIAL: Implemented directly
  await autoUpdater.downloadUpdate();
}
