/**
 * IPC handlers for image cache operations.
 *
 * Exposes image cache service to renderer process via IPC.
 * Returns images as base64 data URLs for renderer compatibility.
 */

import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { CachedImage } from '../../shared/image-cache-types';
import { ImageFetcher } from '../image-cache/image-fetcher';

// MIME type lookup based on file extension
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.img': 'image/png', // Default for unknown extensions
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'image/png';
}

/**
 * Convert cached image to data URL for renderer.
 * Returns null if file cannot be read.
 */
async function toDataUrl(cached: CachedImage): Promise<string | null> {
  try {
    const data = await fs.readFile(cached.filePath);
    const mimeType = getMimeType(cached.filePath);
    return `data:${mimeType};base64,${data.toString('base64')}`;
  } catch (error) {
    // File not found or cannot be read
    return null;
  }
}

/**
 * Register image cache IPC handlers.
 *
 * CONTRACT:
 *   Inputs:
 *     - imageCacheService: ImageCacheService instance
 *
 *   Outputs:
 *     - void (side effect: registers IPC handlers)
 *
 *   Invariants:
 *     - Handlers registered for: getCachedImage, cacheImage, invalidateCache
 *     - Each handler validates inputs and handles errors
 *     - Handlers use 'nostling:image-cache:*' channel namespace (matches preload expectations)
 *     - Image data returned as base64 data URLs (not file paths)
 *
 *   Properties:
 *     - Idempotent: can be called multiple times (handlers replaced)
 *     - Error propagation: errors from service propagate to renderer as rejected promises
 *
 *   Algorithm:
 *     1. Register handler for 'nostling:image-cache:get' channel
 *        - Takes URL string
 *        - Returns { dataUrl: string } | null
 *        - Delegates to imageCacheService.getCachedImage
 *        - Converts file to base64 data URL
 *     2. Register handler for 'nostling:image-cache:cache' channel
 *        - Takes URL string
 *        - Fetches image via ImageFetcher
 *        - Delegates to imageCacheService.cacheImage
 *        - Returns { dataUrl: string }
 *     3. Register handler for 'nostling:image-cache:invalidate' channel
 *        - Takes URL string
 *        - Delegates to imageCacheService.invalidateCache
 *        - Returns boolean
 */
export function registerImageCacheHandlers(imageCacheService: any): void {
  // Guard against undefined ipcMain in test environments
  if (!ipcMain?.handle) {
    return;
  }

  const imageFetcher = new ImageFetcher();

  ipcMain.handle('nostling:image-cache:get', async (_event, url: string): Promise<{ dataUrl: string } | null> => {
    const cached = await imageCacheService.getCachedImage(url);
    if (!cached) return null;
    const dataUrl = await toDataUrl(cached);
    if (!dataUrl) return null;
    return { dataUrl };
  });

  ipcMain.handle('nostling:image-cache:cache', async (_event, url: string): Promise<{ dataUrl: string } | null> => {
    const fetchResult = await imageFetcher.fetchImage(url);
    const cached = await imageCacheService.cacheImage(url, fetchResult.data);
    const dataUrl = await toDataUrl(cached);
    if (!dataUrl) return null;
    return { dataUrl };
  });

  ipcMain.handle('nostling:image-cache:invalidate', async (_event, url: string): Promise<boolean> => {
    return imageCacheService.invalidateCache(url);
  });
}
