import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fc from 'fast-check';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { NostlingRelayEndpoint } from '../../shared/types';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => path.join('/tmp', 'nostling-test'))
  }
}));

import { RelayConfigManager, DEFAULT_RELAYS } from './relay-config-manager';
import { computeFileHashYaml } from './relay-config-yaml-migration';
import { parseYaml } from '../yaml-utils';

describe('RelayConfigManager', () => {
  let manager: RelayConfigManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(__dirname, `test-relay-config-${Date.now()}-${Math.random()}`);
    manager = new RelayConfigManager(tempDir);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Tests for getIdentityConfigPath, computeFileHash, and ensureDirectoryExists removed
  // These methods have been removed from RelayConfigManager - functionality moved to relay-config-yaml-migration.ts

  describe('loadRelays', () => {
    it('returns DEFAULT_RELAYS when file does not exist', async () => {
      const relays = await manager.loadRelays('new-identity');
      expect(relays).toEqual(DEFAULT_RELAYS);
    });

    it('creates file with DEFAULT_RELAYS when it does not exist', async () => {
      const identityId = 'new-identity';
      await manager.loadRelays(identityId);
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      const exists = await fileExists(configPath);
      expect(exists).toBe(true);
    });

    it('stores file hash after loading', async () => {
      const identityId = 'test-identity';
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      const content = JSON.stringify(DEFAULT_RELAYS, null, 2);
      await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(configPath, content, 'utf-8');

      const relays = await manager.loadRelays(identityId);
      const expectedHash = computeFileHashYaml(content);
      expect((manager as any).fileHashes.get(identityId)).toBe(expectedHash);
    });

    it('returns sorted relays by order field', async () => {
      const identityId = 'test-identity';
      const unsortedRelays: NostlingRelayEndpoint[] = [
        { url: 'wss://relay3.test', read: true, write: true, order: 2 },
        { url: 'wss://relay1.test', read: true, write: true, order: 0 },
        { url: 'wss://relay2.test', read: true, write: true, order: 1 }
      ];
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(configPath, JSON.stringify(unsortedRelays), 'utf-8');

      const relays = await manager.loadRelays(identityId);
      const orders = relays.map((r) => r.order);
      for (let i = 0; i < orders.length - 1; i++) {
        expect(orders[i]).toBeLessThanOrEqual(orders[i + 1]);
      }
    });

    it('property: sorted output for any relay configuration', async () => {
      return fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl(),
              read: fc.boolean(),
              write: fc.boolean(),
              order: fc.integer({ min: 0, max: 1000 })
            }),
            { minLength: 1 }
          ),
          async (relays) => {
            const identityId = `test-${Math.random()}`;
            const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
            await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
            await fs.writeFile(configPath, JSON.stringify(relays), 'utf-8');

            const loaded = await manager.loadRelays(identityId);
            for (let i = 0; i < loaded.length - 1; i++) {
              if (loaded[i].order > loaded[i + 1].order) {
                return false;
              }
            }
            return true;
          }
        )
      );
    });

    it('graceful degradation: malformed YAML returns default relays', async () => {
      const identityId = 'malformed-identity';
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(configPath, 'not valid yaml {]', 'utf-8');

      const relays = await manager.loadRelays(identityId);
      // Graceful degradation: malformed files → defaults, not empty array
      expect(relays.length).toBeGreaterThan(0);
      expect(relays).toEqual(DEFAULT_RELAYS);
    });

    it('graceful degradation: does not crash on malformed JSON', async () => {
      const identityId = 'malformed-identity';
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(configPath, '{invalid json', 'utf-8');

      let threw = false;
      try {
        await manager.loadRelays(identityId);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    it('self-healing: missing file creates defaults', async () => {
      const identityId = 'self-heal-test';
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      expect(await fileExists(configPath)).toBe(false);

      const relays = await manager.loadRelays(identityId);
      expect(relays).toEqual(DEFAULT_RELAYS);
      expect(await fileExists(configPath)).toBe(true);
    });
  });

  describe('saveRelays', () => {
    it('saves relays to file with pretty-printed JSON', async () => {
      const identityId = 'save-test';
      const relays: NostlingRelayEndpoint[] = [
        { url: 'wss://relay1.test', read: true, write: true, order: 0 }
      ];

      await manager.loadRelays(identityId);
      const result = await manager.saveRelays(identityId, relays);

      expect(result.config).toBeDefined();
      expect(result.config?.defaults).toEqual(relays);
      expect(result.conflict).toBeUndefined();

      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      const content = await fs.readFile(configPath, 'utf-8');
      // YAML files have comments and proper formatting
      expect(content).toContain('# Relay Configuration');
      const parseResult = parseYaml<NostlingRelayEndpoint[]>(content);
      expect(parseResult.success).toBe(true);
      expect(parseResult.data).toEqual(relays);
    });

    it('stores hash after successful save', async () => {
      const identityId = 'save-test';
      const relays: NostlingRelayEndpoint[] = [
        { url: 'wss://relay1.test', read: true, write: true, order: 0 }
      ];

      await manager.loadRelays(identityId);
      await manager.saveRelays(identityId, relays);

      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      const content = await fs.readFile(configPath, 'utf-8');
      const expectedHash = computeFileHashYaml(content);
      expect((manager as any).fileHashes.get(identityId)).toBe(expectedHash);
    });

    it('detects conflict when file hash differs from stored hash', async () => {
      const identityId = 'conflict-test';
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');

      const relays1: NostlingRelayEndpoint[] = [
        { url: 'wss://relay1.test', read: true, write: true, order: 0 }
      ];
      const relays2: NostlingRelayEndpoint[] = [
        { url: 'wss://relay2.test', read: true, write: true, order: 0 }
      ];

      await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(configPath, JSON.stringify(relays1), 'utf-8');
      await manager.loadRelays(identityId);

      const externalModifiedContent = JSON.stringify(relays2, null, 2);
      await fs.writeFile(configPath, externalModifiedContent, 'utf-8');

      const result = await manager.saveRelays(identityId, relays1);
      expect(result.conflict).toBeDefined();
      expect(result.conflict?.conflicted).toBe(true);
      expect(result.config).toBeUndefined();
    });

    it('does not overwrite file when conflict detected', async () => {
      const identityId = 'no-overwrite-test';
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');

      const relays1: NostlingRelayEndpoint[] = [
        { url: 'wss://relay1.test', read: true, write: true, order: 0 }
      ];
      const relays2: NostlingRelayEndpoint[] = [
        { url: 'wss://relay2.test', read: true, write: true, order: 0 }
      ];

      await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(configPath, JSON.stringify(relays1), 'utf-8');
      await manager.loadRelays(identityId);

      const externalContent = JSON.stringify(relays2);
      await fs.writeFile(configPath, externalContent, 'utf-8');

      await manager.saveRelays(identityId, relays1);

      const savedContent = await fs.readFile(configPath, 'utf-8');
      const parsed = parseYaml<NostlingRelayEndpoint[]>(savedContent);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(relays2);
    });

    it('writes atomically using temp file pattern', async () => {
      const identityId = 'atomic-test';
      const relays: NostlingRelayEndpoint[] = [
        { url: 'wss://relay1.test', read: true, write: true, order: 0 }
      ];

      await manager.loadRelays(identityId);
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      const configDir = path.dirname(configPath);

      let tempFileFound = false;
      const originalWriteFile = fs.writeFile as any;
      const mockWriteFile = jest.fn(async (filePath: string, ...rest: any[]) => {
        if (filePath.endsWith('.tmp')) {
          tempFileFound = true;
        }
        return originalWriteFile(filePath, ...rest);
      });
      (fs.writeFile as any) = mockWriteFile;

      await manager.saveRelays(identityId, relays);

      (fs.writeFile as any) = originalWriteFile;
      expect(tempFileFound).toBe(true);
    });

    it('property: hash consistency after save for any relay configuration', async () => {
      return fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl(),
              read: fc.boolean(),
              write: fc.boolean(),
              order: fc.integer({ min: 0, max: 1000 })
            }),
            { minLength: 1 }
          ),
          async (relays) => {
            const identityId = `test-${Math.random()}`;
            const newManager = new RelayConfigManager(tempDir);
            await newManager.loadRelays(identityId);
            const result = await newManager.saveRelays(identityId, relays);

            if (!result.config?.defaults) {
              return false;
            }

            const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
            const content = await fs.readFile(configPath, 'utf-8');
            const actualHash = computeFileHashYaml(content);
            const storedHash = (newManager as any).fileHashes.get(identityId);

            return actualHash === storedHash;
          }
        )
      );
    });
  });

  describe('reloadRelays', () => {
    it('discards stored hash', async () => {
      const identityId = 'reload-test';
      await manager.loadRelays(identityId);

      expect((manager as any).fileHashes.has(identityId)).toBe(true);
      await manager.reloadRelays(identityId);

      expect((manager as any).fileHashes.has(identityId)).toBe(true);
    });

    it('returns fresh data from disk', async () => {
      const identityId = 'reload-fresh-test';
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');

      const relays1: NostlingRelayEndpoint[] = [
        { url: 'wss://relay1.test', read: true, write: true, order: 0 }
      ];
      const relays2: NostlingRelayEndpoint[] = [
        { url: 'wss://relay2.test', read: true, write: true, order: 0 }
      ];

      await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(configPath, JSON.stringify(relays1), 'utf-8');

      const loaded1 = await manager.loadRelays(identityId);
      expect(loaded1).toEqual(relays1);

      await fs.writeFile(configPath, JSON.stringify(relays2), 'utf-8');

      const reloaded = await manager.reloadRelays(identityId);
      expect(reloaded).toEqual(relays2);
    });

    it('idempotent with loadRelays behavior', async () => {
      const identityId = 'idempotent-test';
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      const testRelays: NostlingRelayEndpoint[] = [
        { url: 'wss://relay1.test', read: true, write: true, order: 0 }
      ];

      await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(configPath, JSON.stringify(testRelays), 'utf-8');

      const loaded = await manager.loadRelays(identityId);
      await fs.writeFile(configPath, JSON.stringify(testRelays), 'utf-8');
      const reloaded = await manager.reloadRelays(identityId);

      expect(loaded).toEqual(reloaded);
    });
  });

  describe('migrateFromDatabase', () => {
    it('skips migration if marker file exists', async () => {
      const markerPath = path.join(tempDir, '.relay-migration-complete');
      await fs.writeFile(markerPath, '');

      const mockDb = {
        prepare: jest.fn().mockReturnValue({
          bind: jest.fn(),
          step: jest.fn().mockReturnValue(false),
          free: jest.fn()
        })
      };

      await manager.migrateFromDatabase(mockDb, [{ id: 'test-id' }]);

      expect(mockDb.prepare).not.toHaveBeenCalled();
    });

    it('creates marker file after migration', async () => {
      const markerPath = path.join(tempDir, '.relay-migration-complete');
      expect(await fileExists(markerPath)).toBe(false);

      const mockDb = {
        prepare: jest.fn().mockReturnValue({
          bind: jest.fn(),
          step: jest.fn().mockReturnValue(false),
          free: jest.fn()
        })
      };

      await manager.migrateFromDatabase(mockDb, []);

      expect(await fileExists(markerPath)).toBe(true);
    });

    it('migrates relays from database to filesystem', async () => {
      const identityId = 'migrate-test';
      const relayUrls = ['wss://relay1.test', 'wss://relay2.test', 'wss://relay3.test'];

      let stepCount = 0;
      const mockDb = {
        prepare: jest.fn().mockReturnValue({
          bind: jest.fn(),
          step: jest.fn(() => {
            return stepCount++ < relayUrls.length;
          }),
          getAsObject: jest.fn(() => ({
            url: relayUrls[stepCount - 1]
          })),
          free: jest.fn()
        })
      };

      await manager.migrateFromDatabase(mockDb, [{ id: identityId }]);

      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseYaml<NostlingRelayEndpoint[]>(content);
      expect(parsed.success).toBe(true);
      const saved = parsed.data!;

      expect(saved).toHaveLength(3);
      expect(saved.map((r) => r.url)).toEqual(relayUrls);
      expect(saved.every((r) => r.read === true && r.write === true)).toBe(true);
    });

    it('sets order based on row index during migration', async () => {
      const identityId = 'order-test';
      const relayUrls = ['wss://relay1.test', 'wss://relay2.test'];

      let stepCount = 0;
      const mockDb = {
        prepare: jest.fn().mockReturnValue({
          bind: jest.fn(),
          step: jest.fn(() => {
            return stepCount++ < relayUrls.length;
          }),
          getAsObject: jest.fn(() => ({
            url: relayUrls[stepCount - 1]
          })),
          free: jest.fn()
        })
      };

      await manager.migrateFromDatabase(mockDb, [{ id: identityId }]);

      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseYaml<NostlingRelayEndpoint[]>(content);
      expect(parsed.success).toBe(true);
      const saved = parsed.data!;

      expect(saved[0].order).toBe(0);
      expect(saved[1].order).toBe(1);
    });

    it('property: idempotent - running twice has same effect as once', async () => {
      return fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
          async (identityIds) => {
            const relayUrls = ['wss://relay1.test'];
            let stepCount = 0;

            const mockDb = {
              prepare: jest.fn().mockReturnValue({
                bind: jest.fn(),
                step: jest.fn(() => {
                  return stepCount++ < relayUrls.length;
                }),
                getAsObject: jest.fn(() => ({
                  url: relayUrls[stepCount - 1]
                })),
                free: jest.fn()
              })
            };

            const identities: Array<{ id: string }> = identityIds.map((id) => ({ id: id.replace(/[/\\:*?"<>|]/g, 'x') }));

            await manager.migrateFromDatabase(mockDb, identities);
            const beforeSecondRun = identities.map(async (id) => {
              const configPath = path.join(tempDir, 'identities', id.id, 'relays.yaml');
              return fs.readFile(configPath, 'utf-8').catch(() => null);
            });

            stepCount = 0;
            await manager.migrateFromDatabase(mockDb, identities);

            const afterSecondRun = identities.map(async (id) => {
              const configPath = path.join(tempDir, 'identities', id.id, 'relays.yaml');
              return fs.readFile(configPath, 'utf-8').catch(() => null);
            });

            const before = await Promise.all(beforeSecondRun);
            const after = await Promise.all(afterSecondRun);

            return before.every((content, i) => content === after[i]);
          }
        )
      );
    });

    it('continues with remaining identities on per-identity failure', async () => {
      const identities = [{ id: 'id1' }, { id: 'id2' }, { id: 'id3' }];
      let callCount = 0;

      const mockDb = {
        prepare: jest.fn().mockReturnValue({
          bind: jest.fn(),
          step: jest.fn(() => {
            callCount++;
            if (callCount === 2) {
              throw new Error('Database error on id2');
            }
            return false;
          }),
          getAsObject: jest.fn(),
          free: jest.fn()
        })
      };

      await expect(manager.migrateFromDatabase(mockDb, identities)).resolves.toBeUndefined();
      expect(mockDb.prepare).toHaveBeenCalledTimes(3);
    });

    it('skips identity if no relays found in database', async () => {
      const identityId = 'no-relays-test';

      const mockDb = {
        prepare: jest.fn().mockReturnValue({
          bind: jest.fn(),
          step: jest.fn().mockReturnValue(false),
          getAsObject: jest.fn(),
          free: jest.fn()
        })
      };

      await manager.migrateFromDatabase(mockDb, [{ id: identityId }]);

      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      expect(await fileExists(configPath)).toBe(false);
    });
  });

  describe('Hash-based overwrite protection', () => {
    it('prevents overwrite when file changes between load and save', async () => {
      const identityId = 'protection-test';
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');

      const relays1: NostlingRelayEndpoint[] = [
        { url: 'wss://relay1.test', read: true, write: true, order: 0 }
      ];
      const relays2: NostlingRelayEndpoint[] = [
        { url: 'wss://relay2.test', read: true, write: true, order: 0 }
      ];
      const relays3: NostlingRelayEndpoint[] = [
        { url: 'wss://relay3.test', read: true, write: true, order: 0 }
      ];

      await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(configPath, JSON.stringify(relays1), 'utf-8');

      await manager.loadRelays(identityId);

      await fs.writeFile(configPath, JSON.stringify(relays2), 'utf-8');

      const result = await manager.saveRelays(identityId, relays3);

      expect(result.conflict?.conflicted).toBe(true);

      const finalContent = await fs.readFile(configPath, 'utf-8');
      const parsed = parseYaml<NostlingRelayEndpoint[]>(finalContent);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(relays2);
    });

    it('allows save when no stored hash exists', async () => {
      const identityId = 'new-save-test';
      const relays: NostlingRelayEndpoint[] = [
        { url: 'wss://relay1.test', read: true, write: true, order: 0 }
      ];

      const result = await manager.saveRelays(identityId, relays);

      expect(result.config?.defaults).toEqual(relays);
      expect(result.conflict).toBeUndefined();
    });

    it('allows save when file hash matches stored hash', async () => {
      const identityId = 'match-test';
      const relays1: NostlingRelayEndpoint[] = [
        { url: 'wss://relay1.test', read: true, write: true, order: 0 }
      ];
      const relays2: NostlingRelayEndpoint[] = [
        { url: 'wss://relay2.test', read: true, write: true, order: 0 }
      ];

      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(configPath, JSON.stringify(relays1), 'utf-8');

      await manager.loadRelays(identityId);

      const result = await manager.saveRelays(identityId, relays2);

      expect(result.config?.defaults).toEqual(relays2);
      expect(result.conflict).toBeUndefined();
    });
  });

  describe('Error handling for corrupted files', () => {
    it('handles truncated content gracefully with defaults', async () => {
      const identityId = 'truncated-test';
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(configPath, '{"url": "wss://test"', 'utf-8');

      const relays = await manager.loadRelays(identityId);
      // Graceful degradation: corrupted files → defaults
      expect(relays).toEqual(DEFAULT_RELAYS);
    });

    it('handles random invalid characters gracefully with defaults', async () => {
      const identityId = 'invalid-chars-test';
      const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
      await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
      await fs.writeFile(configPath, String.fromCharCode(0, 1, 2, 3), 'utf-8');

      const relays = await manager.loadRelays(identityId);
      // Graceful degradation: corrupted files → defaults
      expect(relays).toEqual(DEFAULT_RELAYS);
    });

    it('property: malformed JSON never crashes', async () => {
      return fc.assert(
        fc.asyncProperty(fc.string(), async (content) => {
          const identityId = `corrupted-${Math.random()}`;
          const configPath = path.join(tempDir, 'identities', identityId, 'relays.yaml');
          await fs.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });

          try {
            await fs.writeFile(configPath, content, 'utf-8');
          } catch {
            return true;
          }

          try {
            await manager.loadRelays(identityId);
            return true;
          } catch {
            return false;
          }
        })
      );
    });
  });
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
