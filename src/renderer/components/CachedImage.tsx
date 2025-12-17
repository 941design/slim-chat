/**
 * CachedImage component - Image with disk-based caching.
 *
 * Wraps Chakra UI Image component to provide transparent image caching.
 * Uses IPC to interact with main process cache service.
 */

import React, { useEffect, useState } from 'react';
import { Image, ImageProps } from '@chakra-ui/react';

interface CachedImageProps extends Omit<ImageProps, 'src'> {
  url: string;
  fallbackSrc?: string;
}

/**
 * Display image with automatic caching.
 *
 * CONTRACT:
 *   Inputs:
 *     - url: string, HTTP/HTTPS URL of image to display
 *     - fallbackSrc: string (optional), fallback image URL if main image fails
 *     - ...imageProps: additional Chakra UI Image props
 *
 *   Outputs:
 *     - React element: Chakra UI Image component with cached source
 *
 *   Invariants:
 *     - Image src is either cached file path or original URL
 *     - Loading state shown while fetching/caching
 *     - Fallback displayed on error
 *
 *   Properties:
 *     - Transparent caching: component consumers don't need cache awareness
 *     - Offline support: displays cached images when network unavailable
 *     - Error resilience: falls back gracefully on cache/fetch failures
 *
 *   Algorithm:
 *     1. On mount or URL change:
 *        a. Call window.api.nostling.imageCache.get(url)
 *        b. If cache hit, set src to cached file path (file:// protocol)
 *        c. If cache miss:
 *           i. Call window.api.nostling.imageCache.cache(url)
 *           ii. Set src to cached file path
 *           iii. On error, set src to original URL (fallback to browser HTTP cache)
 *     2. Display Image component with resolved src
 *     3. On error, use fallbackSrc if provided
 */
export function CachedImage({ url, fallbackSrc, ...imageProps }: CachedImageProps): React.ReactElement {
  const [src, setSrc] = useState<string>(url);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadCachedImage = async () => {
      setIsLoading(true);
      try {
        // Try to get from cache first
        const cached = await window.api.nostling?.imageCache?.get(url);

        if (isMounted) {
          if (cached?.dataUrl) {
            // Cache hit: use data URL
            setSrc(cached.dataUrl);
            setIsLoading(false);
          } else {
            // Cache miss: attempt to cache the image
            try {
              const result = await window.api.nostling?.imageCache?.cache(url);
              if (isMounted) {
                if (result?.dataUrl) {
                  setSrc(result.dataUrl);
                } else {
                  // Fall back to original URL
                  setSrc(url);
                }
                setIsLoading(false);
              }
            } catch (cacheError) {
              // Caching failed: fall back to original URL (browser HTTP cache)
              if (isMounted) {
                setSrc(url);
                setIsLoading(false);
              }
            }
          }
        }
      } catch (error) {
        // Get failed: try to cache the image anyway
        if (isMounted) {
          try {
            const result = await window.api.nostling?.imageCache?.cache(url);
            if (isMounted) {
              if (result?.dataUrl) {
                setSrc(result.dataUrl);
              } else {
                setSrc(url);
              }
              setIsLoading(false);
            }
          } catch (cacheError) {
            // Both get and cache failed: use original URL
            if (isMounted) {
              setSrc(url);
              setIsLoading(false);
            }
          }
        }
      }
    };

    loadCachedImage();

    return () => {
      isMounted = false;
    };
  }, [url]);

  return (
    <Image
      src={src}
      {...imageProps}
      loading={isLoading ? 'eager' : 'lazy'}
      onLoad={() => setIsLoading(false)}
      onError={() => {
        if (fallbackSrc) {
          setSrc(fallbackSrc);
        }
        setIsLoading(false);
      }}
    />
  );
}
