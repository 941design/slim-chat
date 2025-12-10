/**
 * Manual DMG installation for macOS (bypasses Squirrel.Mac)
 *
 * This module provides DMG download, mounting, and cleanup operations
 * for unsigned/ad-hoc signed apps that cannot use Squirrel.Mac.
 *
 * Background: Squirrel.Mac requires Apple Developer code signing.
 * With identity=null (ad-hoc signing), Squirrel.Mac verification fails
 * at the native macOS level. This module provides an alternative
 * installation flow using the familiar DMG drag-to-Applications UX.
 */

import { app, shell } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { SignedManifest, ManifestArtifact } from '../../shared/types';
import { hashFile, hashMatches } from '../security/crypto';
import { log } from '../logging';

const execAsync = promisify(exec);

// Cache directory name (matches electron-updater)
const UPDATER_CACHE_DIR = 'slim-chat-updater';

/**
 * Get the cache directory for update downloads
 *
 * Uses platform-specific cache locations:
 * - macOS: ~/Library/Caches/slim-chat-updater
 * - Linux: ~/.cache/slim-chat-updater (or XDG_CACHE_HOME)
 * - Windows: %LOCALAPPDATA%/slim-chat-updater
 */
export function getUpdaterCacheDir(): string {
  // Electron doesn't have 'cache' in app.getPath, but we can construct it
  // from userData which is ~/Library/Application Support/slim-chat on macOS
  const userDataPath = app.getPath('userData');

  if (process.platform === 'darwin') {
    // macOS: ~/Library/Caches/slim-chat-updater
    return path.join(path.dirname(path.dirname(userDataPath)), 'Caches', UPDATER_CACHE_DIR);
  } else if (process.platform === 'linux') {
    // Linux: ~/.cache/slim-chat-updater
    const home = process.env.HOME || '';
    return path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), UPDATER_CACHE_DIR);
  } else {
    // Windows: use temp directory
    return path.join(app.getPath('temp'), UPDATER_CACHE_DIR);
  }
}

/**
 * Find DMG artifact for darwin platform from manifest
 */
export function findDmgArtifact(manifest: SignedManifest): ManifestArtifact | undefined {
  return manifest.artifacts.find(
    (a) => a.platform === 'darwin' && a.type === 'dmg'
  );
}

/**
 * Construct full DMG download URL from artifact
 *
 * The artifact.url is just the filename (e.g., "SlimChat-0.0.20-arm64.dmg")
 * We construct the full GitHub releases URL.
 */
export function constructDmgUrl(
  artifact: ManifestArtifact,
  version: string,
  owner: string,
  repo: string
): string {
  return `https://github.com/${owner}/${repo}/releases/download/${version}/${artifact.url}`;
}

/**
 * Download DMG file from URL with progress tracking
 *
 * CONTRACT:
 *   Inputs:
 *     - dmgUrl: HTTPS URL to DMG file
 *     - destPath: absolute path where DMG will be saved
 *     - onProgress: optional callback for download progress (0-100)
 *
 *   Outputs:
 *     - Promise<void> resolving when download completes
 *     - Rejects with Error on network/filesystem failure
 *
 *   Algorithm:
 *     1. Create destination directory if needed
 *     2. Follow redirects (GitHub uses 302)
 *     3. Stream response to file
 *     4. Report progress via callback
 */
export async function downloadDmg(
  dmgUrl: string,
  destPath: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  // Ensure destination directory exists
  const dir = path.dirname(destPath);
  await fs.promises.mkdir(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    const makeRequest = (url: string, redirectCount = 0): void => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const protocol = url.startsWith('https') ? https : require('http');

      protocol.get(url, (response: any) => {
        // Handle redirects (GitHub uses 302)
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error('Redirect without location header'));
            return;
          }
          makeRequest(redirectUrl, redirectCount + 1);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        const file = fs.createWriteStream(destPath);

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (onProgress && totalBytes > 0) {
            onProgress((downloadedBytes / totalBytes) * 100);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (err: Error) => {
          fs.unlink(destPath, () => {}); // Clean up partial file
          reject(err);
        });
      }).on('error', (err: Error) => {
        fs.unlink(destPath, () => {}); // Clean up partial file
        reject(err);
      });
    };

    makeRequest(dmgUrl);
  });
}

/**
 * Verify DMG hash against expected SHA-256
 *
 * CONTRACT:
 *   Inputs:
 *     - dmgPath: absolute path to downloaded DMG
 *     - expectedHash: SHA-256 hash from manifest (hex string)
 *
 *   Outputs:
 *     - Promise<boolean> true if hash matches
 */
export async function verifyDmgHash(
  dmgPath: string,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await hashFile(dmgPath);
  return hashMatches(actualHash, expectedHash);
}

/**
 * Mount DMG using hdiutil
 *
 * CONTRACT:
 *   Inputs:
 *     - dmgPath: absolute path to DMG file
 *
 *   Outputs:
 *     - Promise<string> resolving to mount point path (e.g., /Volumes/SlimChat)
 *     - Rejects if mounting fails
 *
 *   Algorithm:
 *     1. Run: hdiutil attach {dmgPath} -nobrowse -noverify -noautoopen
 *     2. Parse stdout to find mount point
 *     3. Return mount point path
 */
export async function mountDmg(dmgPath: string): Promise<string> {
  // -nobrowse: don't auto-open in Finder (we'll do it explicitly)
  // -noverify: skip verification (we already verified hash)
  // -noautoopen: don't open files
  const { stdout } = await execAsync(
    `hdiutil attach "${dmgPath}" -nobrowse -noverify -noautoopen`
  );

  // Parse hdiutil output to find mount point
  // Output format: /dev/disk2s1  Apple_HFS  /Volumes/SlimChat
  const lines = stdout.trim().split('\n');
  for (const line of lines) {
    const match = line.match(/\/Volumes\/(.+)$/);
    if (match) {
      return match[0]; // Returns full path: /Volumes/SlimChat
    }
  }

  throw new Error('Failed to parse mount point from hdiutil output');
}

/**
 * Unmount DMG using hdiutil
 *
 * CONTRACT:
 *   Inputs:
 *     - mountPoint: path to mounted volume
 *
 *   Outputs:
 *     - Promise<void> resolving when unmounted
 *     - Silent failure if already unmounted
 */
export async function unmountDmg(mountPoint: string): Promise<void> {
  try {
    await execAsync(`hdiutil detach "${mountPoint}" -force`);
    log('info', `Unmounted DMG: ${mountPoint}`);
  } catch {
    // Silently ignore - volume may already be unmounted
    log('debug', `Failed to unmount ${mountPoint} (may already be unmounted)`);
  }
}

/**
 * Open Finder at mount point
 *
 * Shows the mounted DMG contents with the app icon and
 * Applications folder symlink for drag-and-drop installation.
 */
export async function openFinderAtMountPoint(mountPoint: string): Promise<void> {
  // shell.openPath opens in Finder on macOS
  const result = await shell.openPath(mountPoint);
  if (result) {
    // Non-empty string indicates error
    throw new Error(`Failed to open Finder: ${result}`);
  }
}

/**
 * Clean up stale update mounts on app startup
 *
 * CONTRACT:
 *   Algorithm:
 *     1. List /Volumes for directories matching SlimChat*
 *     2. For each match, run hdiutil detach silently
 *     3. Clean up downloaded DMG files older than 24 hours
 */
export async function cleanupStaleMounts(): Promise<void> {
  if (process.platform !== 'darwin') {
    return;
  }

  try {
    // Check /Volumes for SlimChat mounts
    const volumes = await fs.promises.readdir('/Volumes');
    const slimChatVolumes = volumes.filter((v) => v.startsWith('SlimChat'));

    for (const volume of slimChatVolumes) {
      const mountPoint = path.join('/Volumes', volume);
      log('info', `Cleaning up stale mount: ${mountPoint}`);
      await unmountDmg(mountPoint);
    }

    // Clean up old DMG files in cache
    const cacheDir = getUpdaterCacheDir();
    try {
      const files = await fs.promises.readdir(cacheDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      for (const file of files) {
        if (file.endsWith('.dmg')) {
          const filePath = path.join(cacheDir, file);
          const stats = await fs.promises.stat(filePath);
          if (now - stats.mtimeMs > maxAge) {
            await fs.promises.unlink(filePath);
            log('info', `Cleaned up old DMG: ${file}`);
          }
        }
      }
    } catch {
      // Cache dir may not exist yet
    }
  } catch (err) {
    log('warn', `Cleanup error: ${err instanceof Error ? err.message : err}`);
  }
}
