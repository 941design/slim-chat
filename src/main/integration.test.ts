/**
 * Property-based tests for integration functions
 *
 * Tests verify all contract invariants and properties
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fc from 'fast-check';

jest.mock('./logging', () => ({
  log: jest.fn(),
}));

import { constructManifestUrl, fetchManifest, verifyDownloadedUpdate, sanitizeError } from './integration';
import { UpdateDownloadedEvent } from 'electron-updater';

describe('constructManifestUrl', () => {
  describe('Property: Dev mode takes precedence when devUpdateSource provided', () => {
    it('should return devUpdateSource with /manifest.json appended when provided', () => {
      const devUpdateSource = 'https://github.com/941design/nostling/releases/download/1.0.0';
      const publishConfig = { owner: 'user', repo: 'app' };

      const result = constructManifestUrl(publishConfig, devUpdateSource);

      expect(result).toBe(devUpdateSource + '/manifest.json');
    });

    it('should handle devUpdateSource ending with /', () => {
      const devUpdateSource = 'https://github.com/941design/nostling/releases/download/1.0.0/';
      const publishConfig = { owner: 'user', repo: 'app' };

      const result = constructManifestUrl(publishConfig, devUpdateSource);

      expect(result).toBe(devUpdateSource + 'manifest.json');
    });

    it('should use devUpdateSource even when publishConfig is invalid', () => {
      const devUpdateSource = 'https://custom.example.com/updates';
      const publishConfig = {};

      const result = constructManifestUrl(publishConfig, devUpdateSource);

      expect(result).toBe(devUpdateSource + '/manifest.json');
    });

    it('P001: Dev mode always appends /manifest.json correctly', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          fc.object({ maxDepth: 1 }),
          (devUpdateSource, publishConfig) => {
            const result = constructManifestUrl(publishConfig as any, devUpdateSource);
            expect(result).toMatch(/manifest\.json$/);
            expect(result.includes(devUpdateSource.replace(/\/$/, ''))).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Production mode uses /latest/download/ path', () => {
    it('should construct URL with /latest/download/ for cross-version discovery', () => {
      const result = constructManifestUrl(
        { owner: 'user', repo: 'app' },
        undefined
      );

      expect(result).toBe('https://github.com/user/app/releases/latest/download/manifest.json');
    });

    it('P002: Production URL always contains /latest/download/', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9\-_.]+$/),
          fc.stringMatching(/^[a-zA-Z0-9\-_.]+$/),
          (owner, repo) => {
            const result = constructManifestUrl({ owner, repo }, undefined);
            expect(result).toContain('/latest/download/');
            expect(result).toMatch(
              new RegExp(`^https://github\\.com/${owner}/${repo}/releases/latest/download/manifest\\.json$`)
            );
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P003: Production URL always ends with /manifest.json', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9\-_.]+$/),
          fc.stringMatching(/^[a-zA-Z0-9\-_.]+$/),
          (owner, repo) => {
            const result = constructManifestUrl({ owner, repo }, undefined);
            expect(result).toMatch(/\/manifest\.json$/);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P004: Dev mode URL always ends with /manifest.json', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          (devUpdateSource) => {
            const result = constructManifestUrl({}, devUpdateSource);
            expect(result).toMatch(/\/manifest\.json$/);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Error handling: Empty or missing owner (production mode)', () => {
    it('should throw error when owner is missing and no devUpdateSource', () => {
      expect(() =>
        constructManifestUrl({ repo: 'app' }, undefined)
      ).toThrow('GitHub owner not configured');
    });

    it('should throw error when owner is empty string and no devUpdateSource', () => {
      expect(() =>
        constructManifestUrl({ owner: '', repo: 'app' }, undefined)
      ).toThrow('GitHub owner not configured');
    });

    it('should throw error when owner is only whitespace and no devUpdateSource', () => {
      expect(() =>
        constructManifestUrl({ owner: '   ', repo: 'app' }, undefined)
      ).toThrow('GitHub owner not configured');
    });
  });

  describe('Error handling: Empty or missing repo (production mode)', () => {
    it('should throw error when repo is missing and no devUpdateSource', () => {
      expect(() =>
        constructManifestUrl({ owner: 'user' }, undefined)
      ).toThrow('GitHub repo not configured');
    });

    it('should throw error when repo is empty string and no devUpdateSource', () => {
      expect(() =>
        constructManifestUrl({ owner: 'user', repo: '' }, undefined)
      ).toThrow('GitHub repo not configured');
    });

    it('should throw error when repo is only whitespace and no devUpdateSource', () => {
      expect(() =>
        constructManifestUrl({ owner: 'user', repo: '   ' }, undefined)
      ).toThrow('GitHub repo not configured');
    });
  });

  describe('Examples from specification', () => {
    it('should match production example: 941design/nostling', () => {
      const result = constructManifestUrl({ owner: '941design', repo: 'nostling' }, undefined);
      expect(result).toBe('https://github.com/941design/nostling/releases/latest/download/manifest.json');
    });

    it('should match dev example with GitHub release URL', () => {
      const result = constructManifestUrl(
        {},
        'https://github.com/941design/nostling/releases/download/1.0.0'
      );
      expect(result).toBe('https://github.com/941design/nostling/releases/download/1.0.0/manifest.json');
    });

    it('should match dev example with local file URL', () => {
      const result = constructManifestUrl(
        {},
        'file://./test-manifests/1.0.0'
      );
      expect(result).toBe('file://./test-manifests/1.0.0/manifest.json');
    });
  });
});

describe('fetchManifest', () => {
  const mockFetches: Map<string, { status: number; body: any }> = new Map();
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockFetches.clear();
    global.fetch = (async (url: string, options?: RequestInit) => {
      const mockEntry = mockFetches.get(url as string);

      if (!mockEntry) {
        throw new Error(`No mock configured for URL: ${url}`);
      }

      return {
        ok: mockEntry.status >= 200 && mockEntry.status < 300,
        status: mockEntry.status,
        headers: {},
        json: async () => {
          if (mockEntry.body === null) {
            throw new SyntaxError('Unexpected end of JSON input');
          }
          return mockEntry.body;
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Property-Based Tests: Successful Fetch', () => {
    it('P001: Valid HTTPS URL with valid manifest returns SignedManifest', async () => {
      const url = 'https://example.com/manifest.json';
      const manifest = {
        version: '1.0.0',
        artifacts: [
          {
            url: 'https://example.com/app.dmg',
            sha256: 'a'.repeat(64),
            platform: 'darwin' as const,
            type: 'dmg' as const,
          },
        ],
        signature: 'signature-base64-data',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(url, { status: 200, body: manifest });

      const result = await fetchManifest(url);

      expect(result).toEqual(manifest);
      expect(result.version).toBe('1.0.0');
      expect(result.artifacts).toEqual(manifest.artifacts);
      expect(result.signature).toBe('signature-base64-data');
      expect(result.createdAt).toBe('2024-01-01T00:00:00Z');
    });

    it('P002: 2xx status codes return manifest', async () => {
      const url = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(url, { status: 201, body: manifest });

      const result = await fetchManifest(url);
      expect(result).toEqual(manifest);
    });
  });

  describe('Property-Based Tests: HTTP Status Codes', () => {
    it('P003: Non-2xx status codes throw error (sanitized in production)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.domain().map((d) => `https://${d}/manifest.json`),
            fc.integer({ min: 300, max: 599 })
          ),
          async ([url, status]) => {
            mockFetches.set(url, { status, body: null });

            // In production mode (isDevMode() = false), errors are sanitized
            // HTTP status errors become: "Failed to fetch manifest from server"
            await expect(fetchManifest(url)).rejects.toThrow(
              /Failed to fetch manifest from server/
            );
          }
        ),
        { numRuns: 15 }
      );
    });

    it('P004: 404 error sanitized in production mode', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, { status: 404, body: null });

      try {
        await fetchManifest(url);
        throw new Error('Should have thrown');
      } catch (err) {
        // In production mode, status codes are sanitized
        expect((err as Error).message).toBe('Failed to fetch manifest from server');
      }
    });

    it('P005: 500 server error sanitized in production mode', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, { status: 500, body: null });

      try {
        await fetchManifest(url);
        throw new Error('Should have thrown');
      } catch (err) {
        // In production mode, status codes are sanitized
        expect((err as Error).message).toBe('Failed to fetch manifest from server');
      }
    });
  });

  describe('Property-Based Tests: Manifest Structure Validation', () => {
    it('P006: Missing required fields throw validation error', async () => {
      const url = 'https://example.com/manifest.json';
      const baseManifest = {
        version: '1.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      // Test missing version
      const noVersion = { ...baseManifest };
      delete (noVersion as any).version;
      mockFetches.set(url, { status: 200, body: noVersion });

      await expect(fetchManifest(url)).rejects.toThrow('Missing required manifest fields');
    });

    it('P007: All four required fields are validated', async () => {
      const url = 'https://example.com/manifest.json';

      const invalidManifests = [
        { artifacts: [], signature: 'sig', createdAt: new Date().toISOString() },
        { version: '1.0.0', signature: 'sig', createdAt: new Date().toISOString() },
        { version: '1.0.0', artifacts: [], createdAt: new Date().toISOString() },
        { version: '1.0.0', artifacts: [], signature: 'sig' },
      ];

      for (const invalidManifest of invalidManifests) {
        mockFetches.clear();
        mockFetches.set(url, { status: 200, body: invalidManifest });

        await expect(fetchManifest(url)).rejects.toThrow('Missing required manifest fields');
      }
    });

    it('P008: Non-string version throws validation error', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, {
        status: 200,
        body: {
          version: 123,
          artifacts: [],
          signature: 'sig',
          createdAt: new Date().toISOString(),
        },
      });

      await expect(fetchManifest(url)).rejects.toThrow('field "version" must be a string');
    });

    it('P009: Non-array artifacts throws validation error', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, {
        status: 200,
        body: {
          version: '1.0.0',
          artifacts: 'not-an-array',
          signature: 'sig',
          createdAt: new Date().toISOString(),
        },
      });

      await expect(fetchManifest(url)).rejects.toThrow('field "artifacts" must be an array');
    });

    it('P010: Non-string signature throws validation error', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, {
        status: 200,
        body: {
          version: '1.0.0',
          artifacts: [],
          signature: 123,
          createdAt: new Date().toISOString(),
        },
      });

      await expect(fetchManifest(url)).rejects.toThrow('field "signature" must be a string');
    });

    it('P011: Non-string createdAt throws validation error', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, {
        status: 200,
        body: {
          version: '1.0.0',
          artifacts: [],
          signature: 'sig',
          createdAt: 123,
        },
      });

      await expect(fetchManifest(url)).rejects.toThrow('field "createdAt" must be a string');
    });

    it('P012: Non-object JSON throws validation error', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, { status: 200, body: 'not-an-object' });

      await expect(fetchManifest(url)).rejects.toThrow('Manifest must be a valid JSON object');
    });

    it('P013: Empty manifest object throws missing fields error', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, { status: 200, body: {} });

      await expect(fetchManifest(url)).rejects.toThrow('Missing required manifest fields');
    });
  });

  describe('Property-Based Tests: URL Validation', () => {
    it('P014: HTTPS URLs accepted', async () => {
      const url = 'https://example.com/manifest.json';
      const manifest = {
        version: '1.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(url, { status: 200, body: manifest });

      await expect(fetchManifest(url)).resolves.toBeDefined();
    });

    it('P015: HTTP URLs are rejected (sanitized in production)', async () => {
      await expect(fetchManifest('http://example.com/manifest.json')).rejects.toThrow('Invalid update source configuration');
    });

    it('P016: Other protocols (ftp, file, etc.) are rejected (sanitized)', async () => {
      await expect(fetchManifest('ftp://example.com/manifest.json')).rejects.toThrow('Invalid update source configuration');
      await expect(fetchManifest('file:///tmp/manifest.json')).rejects.toThrow('Invalid update source configuration');
    });

    it('P017: Malformed URLs throw validation error (sanitized)', async () => {
      await expect(fetchManifest('not-a-url')).rejects.toThrow('Invalid update source configuration');
      await expect(fetchManifest('://missing-protocol')).rejects.toThrow('Invalid update source configuration');
      await expect(fetchManifest('')).rejects.toThrow('Invalid update source configuration');
    });
  });

  describe('Property-Based Tests: Network Errors', () => {
    it('P018: Network errors are propagated', async () => {
      global.fetch = (async () => {
        throw new Error('Network error');
      }) as unknown as typeof fetch;

      await expect(fetchManifest('https://example.com/manifest.json')).rejects.toThrow('Network error');
    });

    it('P019: Timeout errors propagated', async () => {
      global.fetch = (async () => {
        throw new Error('Request timeout');
      }) as unknown as typeof fetch;

      await expect(fetchManifest('https://example.com/manifest.json')).rejects.toThrow('Request timeout');
    });
  });

  describe('Property-Based Tests: JSON Parsing', () => {
    it('P020: Invalid JSON throws parse error (sanitized in production)', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, { status: 200, body: null });

      await expect(fetchManifest(url)).rejects.toThrow('Manifest format is invalid');
    });
  });

  describe('Example-Based Tests: Critical Cases', () => {
    it('E001: Specific manifest with all fields returns correctly', async () => {
      const url = 'https://example.com/manifest.json';
      const manifest = {
        version: '1.0.0',
        artifacts: [
          {
            url: 'https://example.com/app.dmg',
            sha256: 'a'.repeat(64),
            platform: 'darwin' as const,
            type: 'dmg' as const,
          },
        ],
        signature: 'signature-base64-data',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(url, { status: 200, body: manifest });

      const result = await fetchManifest(url);

      expect(result.version).toBe('1.0.0');
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].platform).toBe('darwin');
      expect(result.signature).toBe('signature-base64-data');
      expect(result.createdAt).toBe('2024-01-01T00:00:00Z');
    });

    it('E002: HTTP URL rejected immediately (sanitized in production)', async () => {
      try {
        await fetchManifest('http://example.com/manifest.json');
        throw new Error('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toBe('Invalid update source configuration');
      }
    });

    it('E003: Multiple artifact types in manifest', async () => {
      const url = 'https://example.com/manifest.json';
      const manifest = {
        version: '1.5.0',
        artifacts: [
          {
            url: 'https://example.com/app.dmg',
            sha256: 'a'.repeat(64),
            platform: 'darwin' as const,
            type: 'dmg' as const,
          },
          {
            url: 'https://example.com/app.AppImage',
            sha256: 'b'.repeat(64),
            platform: 'linux' as const,
            type: 'AppImage' as const,
          },
          {
            url: 'https://example.com/app.exe',
            sha256: 'c'.repeat(64),
            platform: 'win32' as const,
            type: 'exe' as const,
          },
        ],
        signature: 'multi-platform-signature',
        createdAt: '2024-01-15T10:00:00Z',
      };

      mockFetches.set(url, { status: 200, body: manifest });

      const result = await fetchManifest(url);

      expect(result.artifacts).toHaveLength(3);
      expect(result.artifacts[0].platform).toBe('darwin');
      expect(result.artifacts[1].platform).toBe('linux');
      expect(result.artifacts[2].platform).toBe('win32');
    });
  });
});

describe('verifyDownloadedUpdate', () => {
  const mockFetches: Map<string, { status: number; body: any }> = new Map();
  let logSpy: any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockFetches.clear();
    const { log } = require('./logging');
    logSpy = log;

    global.fetch = (async (url: string, options?: RequestInit) => {
      const mockEntry = mockFetches.get(url as string);

      if (!mockEntry) {
        throw new Error(`No mock configured for URL: ${url}`);
      }

      return {
        ok: mockEntry.status >= 200 && mockEntry.status < 300,
        status: mockEntry.status,
        headers: {},
        json: async () => {
          if (mockEntry.body === null) {
            throw new SyntaxError('Unexpected end of JSON input');
          }
          return mockEntry.body;
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('Property: Complete verification flow succeeds with valid inputs', () => {
    it('should log fetch start message when verification succeeds', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      // Mock the verifyManifest function
      const verifyModule = await import('./security/verify');
      const originalVerifyManifest = verifyModule.verifyManifest;
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      const result = await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(logSpy).toHaveBeenCalledWith('info', `Fetching manifest from ${manifestUrl}`);
      expect(result).toEqual({ verified: true });
    });

    it('should log verification success message with manifest version', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '3.5.1',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(logSpy).toHaveBeenCalledWith('info', 'Manifest verified for version 3.5.1');
    });

    it('should return exactly { verified: true } on success', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      const result = await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(result).toStrictEqual({ verified: true });
      expect(Object.keys(result)).toEqual(['verified']);
    });
  });

  describe('Property: Manifest fetch failure propagates', () => {
    it('should propagate fetch error when manifest request fails (sanitized)', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      mockFetches.set(manifestUrl, { status: 404, body: null });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow(/Failed to fetch manifest from server/);
    });

    it('should propagate network error when fetch fails', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      global.fetch = (async () => {
        throw new Error('Network timeout');
      }) as unknown as typeof fetch;

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow('Network timeout');
    });

    it('should propagate JSON parse error (sanitized)', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      mockFetches.set(manifestUrl, { status: 200, body: null });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow(/Manifest format is invalid/);
    });
  });

  describe('Property: File path missing throws error', () => {
    it('should throw error when downloadedFile property is missing', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {};

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow('Downloaded file path missing');
    });

    it('should throw error when downloadedFile is null', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: null as any,
      };

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow('Downloaded file path missing');
    });

    it('should throw error when downloadedFile is empty string', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '',
      };

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow('Downloaded file path missing');
    });
  });

  describe('Property: All steps execute in correct order', () => {
    it('should fetch manifest before calling verifyManifest', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      const callOrder: string[] = [];
      logSpy.mockImplementation((level: string, msg: string) => {
        if (msg.includes('Fetching manifest')) {
          callOrder.push('log-fetch');
        } else if (msg.includes('Manifest verified')) {
          callOrder.push('log-verify');
        }
      });

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockImplementation(() => {
        callOrder.push('verify');
        return Promise.resolve({ verified: true });
      });

      await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(callOrder).toEqual(['log-fetch', 'verify', 'log-verify']);
    });

    it('should not call verifyManifest if manifest fetch fails', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      mockFetches.set(manifestUrl, { status: 500, body: null });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      const verifyModule = await import('./security/verify');
      const mockVerify = jest.spyOn(verifyModule, 'verifyManifest');

      try {
        await verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        );
      } catch (e) {
        // Expected to throw
      }

      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('should throw error and not call verifyManifest if file path missing', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {};

      const verifyModule = await import('./security/verify');
      const mockVerify = jest.spyOn(verifyModule, 'verifyManifest');

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow('Downloaded file path missing');

      expect(mockVerify).not.toHaveBeenCalled();
    });
  });

  describe('Example-Based Tests: Critical Verification Scenarios', () => {
    it('E001: Darwin platform verification with valid manifest', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.5.0',
        artifacts: [
          {
            url: 'https://example.com/app-darwin.dmg',
            sha256: 'd'.repeat(64),
            platform: 'darwin' as const,
            type: 'dmg' as const,
          },
        ],
        signature: 'darwin-sig-base64',
        createdAt: '2024-01-15T10:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/tmp/update.dmg',
      };

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      const result = await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '2.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(result).toEqual({ verified: true });
    });

    it('E002: Linux platform verification with valid manifest', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '3.0.0',
        artifacts: [
          {
            url: 'https://example.com/app-linux.AppImage',
            sha256: 'l'.repeat(64),
            platform: 'linux' as const,
            type: 'AppImage' as const,
          },
        ],
        signature: 'linux-sig-base64',
        createdAt: '2024-01-16T15:30:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/tmp/update.AppImage',
      };

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      const result = await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '2.5.0',
        'linux',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(result).toEqual({ verified: true });
    });

    it('E003: Windows platform verification with valid manifest', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '1.5.0',
        artifacts: [
          {
            url: 'https://example.com/app-win.exe',
            sha256: 'w'.repeat(64),
            platform: 'win32' as const,
            type: 'exe' as const,
          },
        ],
        signature: 'win-sig-base64',
        createdAt: '2024-01-17T08:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: 'C:\\Users\\AppData\\Local\\Temp\\update.exe',
      };

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      const result = await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'win32',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(result).toEqual({ verified: true });
    });

    it('E004: Extracts and passes file path to verifyManifest correctly', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const filePath = '/path/to/file.dmg';
      const downloadEvent: any = {
        downloadedFile: filePath,
      };

      const verifyModule = await import('./security/verify');
      const mockVerify = jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(mockVerify).toHaveBeenCalledWith(
        expect.objectContaining({ version: '2.0.0' }),
        filePath,
        '1.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM='
      );
    });
  });
});

describe('TR5: File Protocol Dev Mode Test (FR2)', () => {
  const mockFetches: Map<string, { status: number; body: any }> = new Map();
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockFetches.clear();
    global.fetch = (async (url: string, options?: RequestInit) => {
      const mockEntry = mockFetches.get(url as string);

      if (!mockEntry) {
        throw new Error(`No mock configured for URL: ${url}`);
      }

      return {
        ok: mockEntry.status >= 200 && mockEntry.status < 300,
        status: mockEntry.status,
        headers: {},
        json: async () => {
          if (mockEntry.body === null) {
            throw new SyntaxError('Unexpected end of JSON input');
          }
          return mockEntry.body;
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Property-Based Tests: File Protocol Support (FR2)', () => {
    it('P001: HTTPS URLs always accepted regardless of allowFileProtocol flag', async () => {
      const url = 'https://example.com/manifest.json';
      const manifest = {
        version: '1.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };
      mockFetches.set(url, { status: 200, body: manifest });

      // Should work with both true and false
      const result1 = await fetchManifest(url, 30000, true);
      expect(result1).toEqual(manifest);

      mockFetches.set(url, { status: 200, body: manifest });
      const result2 = await fetchManifest(url, 30000, false);
      expect(result2).toEqual(manifest);
    });

    it('P002: File protocol URLs accepted when allowFileProtocol=true', async () => {
      const fileUrl = 'file:///tmp/manifest.json';
      const manifest = {
        version: '1.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };
      mockFetches.set(fileUrl, { status: 200, body: manifest });

      const result = await fetchManifest(fileUrl, 30000, true);
      expect(result).toEqual(manifest);
    });

    it('P003: File protocol URLs rejected when allowFileProtocol=false (default)', async () => {
      const fileUrl = 'file:///tmp/manifest.json';

      await expect(fetchManifest(fileUrl, 30000, false)).rejects.toThrow(
        'Invalid update source configuration'
      );
    });

    it('P004: File protocol URLs rejected when allowFileProtocol not provided (defaults to false)', async () => {
      const fileUrl = 'file:///tmp/manifest.json';

      await expect(fetchManifest(fileUrl)).rejects.toThrow(
        'Invalid update source configuration'
      );
    });

    it('P005: HTTP URLs always rejected regardless of allowFileProtocol flag', async () => {
      const httpUrl = 'http://example.com/manifest.json';

      await expect(fetchManifest(httpUrl, 30000, true)).rejects.toThrow(
        'Invalid update source configuration'
      );
      await expect(fetchManifest(httpUrl, 30000, false)).rejects.toThrow(
        'Invalid update source configuration'
      );
    });

    it('P006: Other protocols (ftp, gopher, etc.) always rejected', async () => {
      await expect(fetchManifest('ftp://example.com/manifest.json', 30000, true)).rejects.toThrow(
        'Invalid update source configuration'
      );
      await expect(fetchManifest('gopher://example.com/manifest.json', 30000, true)).rejects.toThrow(
        'Invalid update source configuration'
      );
    });
  });

  describe('Example-Based Tests: Dev Mode File Protocol Scenarios', () => {
    it('E001: Dev mode with file:// URL loads manifest successfully', async () => {
      const fileUrl = 'file:///tmp/test-manifests/1.0.0/manifest.json';
      const manifest = {
        version: '1.0.0',
        artifacts: [
          {
            url: 'file:///tmp/test-manifests/1.0.0/app.dmg',
            sha256: 'a'.repeat(64),
            platform: 'darwin' as const,
            type: 'dmg' as const,
          },
        ],
        signature: 'dev-test-signature',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(fileUrl, { status: 200, body: manifest });

      const result = await fetchManifest(fileUrl, 30000, true);

      expect(result.version).toBe('1.0.0');
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].url).toBe('file:///tmp/test-manifests/1.0.0/app.dmg');
    });

    it('E002: Production mode rejects file:// URL with clear error', async () => {
      const fileUrl = 'file:///tmp/manifest.json';

      await expect(fetchManifest(fileUrl, 30000, false)).rejects.toThrow(
        'Invalid update source configuration'
      );
    });

    it('E003: Dev mode still accepts HTTPS URLs', async () => {
      const httpsUrl = 'https://github.com/941design/nostling/releases/latest/download/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(httpsUrl, { status: 200, body: manifest });

      const result = await fetchManifest(httpsUrl, 30000, true);

      expect(result.version).toBe('2.0.0');
    });

    it('E004: File protocol flag controls behavior independently of protocol', async () => {
      const fileUrl = 'file:///local/manifest.json';
      const manifest = {
        version: '1.5.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(fileUrl, { status: 200, body: manifest });

      // Should succeed with flag true
      const result = await fetchManifest(fileUrl, 30000, true);
      expect(result.version).toBe('1.5.0');

      // Should fail with flag false
      await expect(fetchManifest(fileUrl, 30000, false)).rejects.toThrow(
        'Invalid update source configuration'
      );
    });

    it('E005: Invalid URLs throw validation error even with allowFileProtocol=true', async () => {
      // Test with completely malformed URL
      await expect(fetchManifest('ht!tp://[invalid', 30000, true)).rejects.toThrow(
        'Invalid update source configuration'
      );
    });

    it('E006: File URL in local test manifest dev workflow', async () => {
      const devTestUrl = 'file:///tmp/.test-updates/manifest.json';
      const manifest = {
        version: '0.0.1-dev',
        artifacts: [
          {
            url: 'file:///tmp/.test-updates/app-debug.dmg',
            sha256: 'd'.repeat(64),
            platform: 'darwin' as const,
            type: 'dmg' as const,
          },
        ],
        signature: 'dev-unsigned-test',
        createdAt: '2024-01-20T14:30:00Z',
      };

      mockFetches.set(devTestUrl, { status: 200, body: manifest });

      const result = await fetchManifest(devTestUrl, 30000, true);

      expect(result.version).toBe('0.0.1-dev');
      expect(result.artifacts[0].url).toContain('.test-updates');
    });
  });

  describe('Integration with constructManifestUrl: Dev server scenario', () => {
    it('E007: constructManifestUrl creates file:// URL that works with allowFileProtocol=true', async () => {
      const devUpdateSource = 'file:///tmp/test-updates';
      const publishConfig = {};

      const manifestUrl = constructManifestUrl(publishConfig, devUpdateSource);
      expect(manifestUrl).toBe('file:///tmp/test-updates/manifest.json');

      const manifest = {
        version: '1.5.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const result = await fetchManifest(manifestUrl, 30000, true);
      expect(result.version).toBe('1.5.0');
    });

    it('E008: Dev URL fails when used without allowFileProtocol flag', async () => {
      const devUpdateSource = 'file:///tmp/test-updates';
      const publishConfig = {};

      const manifestUrl = constructManifestUrl(publishConfig, devUpdateSource);

      await expect(fetchManifest(manifestUrl, 30000, false)).rejects.toThrow(
        'Invalid update source configuration'
      );
    });

    it('E009: verifyDownloadedUpdate passes allowFileProtocol to fetchManifest', async () => {
      const fileUrl = 'file:///tmp/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(fileUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      const result = await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'darwin',
        'test-key',
        fileUrl,
        true
      );

      expect(result).toEqual({ verified: true });
    });

    it('E010: verifyDownloadedUpdate rejects file:// URL with allowFileProtocol=false', async () => {
      const fileUrl = 'file:///tmp/manifest.json';

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'test-key',
          fileUrl,
          false
        )
      ).rejects.toThrow('Invalid update source configuration');
    });
  });
});

/**
 * FR4: Error Message Sanitization Tests
 *
 * Tests verify sanitizeError meets all contract requirements:
 * - Dev mode preserves full error details for debugging
 * - Production mode hides implementation details
 * - Security: no technical details leaked to users
 * - All error types properly categorized and sanitized
 */
describe('sanitizeError', () => {
  describe('Dev Mode (isDev = true)', () => {
    it('P001: Dev mode returns Error instance unchanged', () => {
      fc.assert(
        fc.property(fc.string(), (msg) => {
          const error = new Error(msg);
          const result = sanitizeError(error, true);
          expect(result).toBe(error);
          expect(result.message).toBe(msg);
        }),
        { numRuns: 50 }
      );
    });

    it('E001: Dev mode preserves complex error messages', () => {
      const complexMsg = 'Manifest request failed with status 404: Not found';
      const error = new Error(complexMsg);
      const result = sanitizeError(error, true);
      expect(result.message).toBe(complexMsg);
    });
  });

  describe('Production Mode - HTTP Status Codes', () => {
    it('P002: 404 status codes are sanitized', () => {
      const error = new Error('Manifest request failed with status 404');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Failed to fetch manifest from server');
      expect(result.message).not.toContain('404');
    });

    it('P003: 500 status codes are sanitized', () => {
      const error = new Error('Server error with status 500');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Failed to fetch manifest from server');
      expect(result.message).not.toContain('500');
    });
  });

  describe('Production Mode - JSON Parse Errors', () => {
    it('P004: JSON parse errors are sanitized', () => {
      const error = new Error('Failed to parse manifest JSON: Unexpected token');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Manifest format is invalid');
    });

    it('P005: JSON syntax errors are sanitized', () => {
      const error = new Error('SyntaxError: Unexpected token } in JSON at position 42');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Manifest format is invalid');
      expect(result.message).not.toContain('position');
    });
  });

  describe('Production Mode - Field Validation Errors', () => {
    it('P006: Missing required fields are sanitized', () => {
      const error = new Error('Missing required manifest fields: artifacts, signature');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Manifest validation failed');
      expect(result.message).not.toContain('artifacts');
      expect(result.message).not.toContain('signature');
    });

    it('P007: Required keyword triggers sanitization', () => {
      const error = new Error('Manifest field "version" is required');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Manifest validation failed');
      expect(result.message).not.toContain('version');
    });
  });

  describe('Production Mode - URL Errors', () => {
    it('P008: Invalid URL errors are sanitized', () => {
      const error = new Error('Invalid URL: some-malformed-url');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Invalid update source configuration');
    });

    it('P009: Protocol errors are sanitized', () => {
      const error = new Error('Invalid manifest URL: Invalid protocol detected');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Invalid update source configuration');
      expect(result.message).not.toContain('protocol');
    });
  });

  describe('Production Mode - Timeout Errors', () => {
    it('P010: Timeout errors preserve message without leaking details', () => {
      const error = new Error('Manifest fetch timed out after 30000ms');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Manifest fetch timed out');
      expect(result.message).not.toContain('30000');
    });

    it('P011: Timeout keyword variant handling', () => {
      const error = new Error('Manifest request timeout');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Manifest fetch timed out');
    });
  });

  describe('Production Mode - Generic Fallback', () => {
    it('P012: Unknown error types return generic fallback', () => {
      const error = new Error('Something went wrong');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Update verification failed');
    });
  });

  describe('Security: No Technical Details Leaked', () => {
    it('P013: Sensitive field names not in production errors', () => {
      const error = new Error('Missing required manifest fields: version, artifacts, signature, createdAt');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Manifest validation failed');
      expect(result.message).not.toContain('version');
      expect(result.message).not.toContain('artifacts');
      expect(result.message).not.toContain('signature');
      expect(result.message).not.toContain('createdAt');
    });

    it('P014: HTTP status codes not visible in production', () => {
      const error = new Error('request with status 502');
      const result = sanitizeError(error, false);
      expect(result.message).not.toContain('502');
    });

    it('P015: Implementation details stripped from parse errors', () => {
      const error = new Error('Failed to parse JSON: Unexpected token at position 42');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Manifest format is invalid');
      expect(result.message).not.toContain('42');
    });
  });

  describe('Error Type Handling', () => {
    it('P016: Works with Error instances', () => {
      const error = new Error('test error');
      const result = sanitizeError(error, false);
      expect(result).toBeInstanceOf(Error);
    });

    it('P017: Works with string inputs', () => {
      const result = sanitizeError('test error', false);
      expect(result).toBeInstanceOf(Error);
    });

    it('P018: Handles null/undefined gracefully', () => {
      const resultNull = sanitizeError(null, false);
      expect(resultNull).toBeInstanceOf(Error);

      const resultUndefined = sanitizeError(undefined, false);
      expect(resultUndefined).toBeInstanceOf(Error);
    });
  });

  describe('Production Mode - Squirrel.Mac Code Signature Errors (macOS)', () => {
    it('P019: "Code signature" errors are sanitized as macOS code signature', () => {
      const error = new Error('Code signature at URL file:///app.app did not pass validation');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('macOS code signature verification failed (Squirrel.Mac)');
      expect(result.message).not.toContain('URL');
    });

    it('P020: "designated requirement" errors are sanitized as macOS code signature', () => {
      const error = new Error('code failed to satisfy specified designated requirement(s)');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('macOS code signature verification failed (Squirrel.Mac)');
    });

    it('P021: "did not pass validation" errors are sanitized as macOS code signature', () => {
      const error = new Error('Update did not pass validation: code object is not signed');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('macOS code signature verification failed (Squirrel.Mac)');
    });

    it('P022: Custom RSA "signature" errors NOT caught by Squirrel.Mac pattern', () => {
      // Our custom RSA verification throws "Manifest signature verification failed"
      // This should NOT be caught by the Squirrel.Mac pattern
      const error = new Error('Manifest signature verification failed');
      const result = sanitizeError(error, false);
      // Should fall through to generic signature handler, which returns same message
      expect(result.message).toBe('Manifest signature verification failed');
    });

    it('P023: Generic "signature" errors sanitized as manifest signature', () => {
      // Errors with just "signature" but not "code signature" patterns
      const error = new Error('RSA signature invalid');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Manifest signature verification failed');
    });

    it('P024: Complex Squirrel.Mac error with multiple patterns', () => {
      // Real-world Squirrel.Mac error message
      const error = new Error(
        'Error Domain=SQRLCodeSignatureErrorDomain Code=-1 "Code signature at URL file:///private/var/folders/.../Nostling.app did not pass validation: code failed to satisfy specified code requirement(s)"'
      );
      const result = sanitizeError(error, false);
      expect(result.message).toBe('macOS code signature verification failed (Squirrel.Mac)');
      expect(result.message).not.toContain('SQRLCodeSignatureErrorDomain');
      expect(result.message).not.toContain('private/var');
    });
  });

  describe('Production Mode - Network/Offline Errors', () => {
    it('P025: ENOTFOUND (DNS resolution) errors indicate offline', () => {
      const error = new Error('getaddrinfo ENOTFOUND github.com');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Network is offline');
    });

    it('P026: ECONNREFUSED errors indicate offline/server unavailable', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:443');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Network is offline');
    });

    it('P027: net::ERR_INTERNET_DISCONNECTED errors indicate offline', () => {
      const error = new Error('net::ERR_INTERNET_DISCONNECTED');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Network is offline');
    });

    it('P028: net::ERR_NAME_NOT_RESOLVED errors indicate offline', () => {
      const error = new Error('net::ERR_NAME_NOT_RESOLVED');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Network is offline');
    });

    it('P029: net::ERR_NETWORK_CHANGED errors indicate offline', () => {
      const error = new Error('net::ERR_NETWORK_CHANGED');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Network is offline');
    });

    it('P030: net::ERR_CONNECTION_RESET errors indicate offline', () => {
      const error = new Error('net::ERR_CONNECTION_RESET');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Network is offline');
    });

    it('P031: ETIMEDOUT (connection timeout) errors indicate offline', () => {
      const error = new Error('connect ETIMEDOUT 140.82.121.3:443');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Network is offline');
    });

    it('P032: EAI_AGAIN (DNS temporary failure) errors indicate offline', () => {
      const error = new Error('getaddrinfo EAI_AGAIN github.com');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Network is offline');
    });

    it('P033: "fetch failed" errors indicate offline', () => {
      const error = new Error('fetch failed');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Network is offline');
    });

    it('P034: "network error" errors indicate offline', () => {
      const error = new Error('Network error while fetching manifest');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Network is offline');
    });

    it('P035: Dev mode preserves full offline error message', () => {
      const error = new Error('getaddrinfo ENOTFOUND github.com');
      const result = sanitizeError(error, true);
      expect(result.message).toBe('getaddrinfo ENOTFOUND github.com');
    });
  });

  describe('Specification Examples', () => {
    it('E002: Dev mode preserves 404 error', () => {
      const error = new Error('Manifest request failed with status 404');
      const result = sanitizeError(error, true);
      expect(result.message).toBe('Manifest request failed with status 404');
    });

    it('E003: Production mode 404 sanitized', () => {
      const error = new Error('Manifest request failed with status 404');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Failed to fetch manifest from server');
    });

    it('E004: JSON parse error sanitized', () => {
      const error = new Error('Failed to parse manifest JSON: Unexpected token');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Manifest format is invalid');
    });

    it('E005: Validation error sanitized', () => {
      const error = new Error('Missing required manifest fields: artifacts, signature');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Manifest validation failed');
    });

    it('E006: URL error sanitized', () => {
      const error = new Error('Invalid manifest URL: Invalid URL');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Invalid update source configuration');
    });

    it('E007: Timeout error sanitized', () => {
      const error = new Error('Manifest fetch timed out after 30000ms');
      const result = sanitizeError(error, false);
      expect(result.message).toBe('Manifest fetch timed out');
    });
  });
});
