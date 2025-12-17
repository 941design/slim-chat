/**
 * Image cache type definitions shared between main and renderer processes.
 */

export interface CachedImage {
  url: string;
  filePath: string;
  dataUrl?: string;
  timestamp: number;
  size: number;
}

export interface CacheMetadata {
  url: string;
  filePath: string;
  timestamp: number;
  size: number;
  lastAccessed: number;
}

export interface CacheStats {
  totalSize: number;
  itemCount: number;
  oldestTimestamp: number;
  newestTimestamp: number;
}
