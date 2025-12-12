import { describe, expect, it, beforeAll, beforeEach, jest } from '@jest/globals';
import * as fc from 'fast-check';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NostlingService } from './service';
import { NostlingSecretStore } from './secret-store';
import { RelayConfigManager, DEFAULT_RELAYS } from './relay-config-manager';
import { NostlingRelayEndpoint } from '../../shared/types';
import { runMigrations } from '../database/migrations';
import { log } from '../logging';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp'),
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn().mockReturnValue(false),
    encryptString: jest.fn(),
    decryptString: jest.fn(),
  },
}));

jest.mock('../logging', () => ({
  log: jest.fn(),
  setLogLevel: jest.fn(),
  getRecentLogs: jest.fn(),
}));

class MemorySecretStore implements NostlingSecretStore {
  public readonly kind = 'local' as const;
  private readonly secrets = new Map<string, string>();

  async getSecret(ref: string): Promise<string | null> {
    return this.secrets.get(ref) || null;
  }

  async saveSecret(secret: string, ref?: string): Promise<string> {
    const key = ref || `ref:${this.secrets.size + 1}`;
    this.secrets.set(key, secret);
    return key;
  }

  async deleteSecret(ref: string): Promise<void> {
    this.secrets.delete(ref);
  }

  async listSecretRefs(): Promise<string[]> {
    return Array.from(this.secrets.keys());
  }
}

let SQL: SqlJsStatic;
let database: Database;
let secretStore: MemorySecretStore;
let service: NostlingService;
let tempDir: string;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(async () => {
  database = new SQL.Database();
  await runMigrations(database);
  secretStore = new MemorySecretStore();
  tempDir = path.join(os.tmpdir(), `nostling-test-${Date.now()}`);
  service = new NostlingService(database, secretStore, tempDir);
  (log as jest.Mock).mockClear();
});

describe('RelayConfigManager Integration with NostlingService', () => {
  describe('Migration Idempotency', () => {
    it('migration runs correctly with one identity', async () => {
      const identity = await service.createIdentity({ label: 'Test', nsec: 'secret', npub: 'npub1' });

      // Add some relays to database
      for (let i = 0; i < 3; i++) {
        database.run('INSERT INTO nostr_relays (id, identity_id, url) VALUES (?, ?, ?)', [
          `relay-${i}`,
          identity.id,
          `wss://relay${i}.example.com`,
        ]);
      }

      // Run migration multiple times - should be idempotent
      const identities = await service.listIdentities();
      await service['relayConfigManager'].migrateFromDatabase(database, identities);
      await service['relayConfigManager'].migrateFromDatabase(database, identities);
      await service['relayConfigManager'].migrateFromDatabase(database, identities);

      // Verify that marker file exists and migration completed
      const markerPath = path.join(tempDir, '.relay-migration-complete');
      const markerExists = await fs
        .access(markerPath)
        .then(() => true)
        .catch(() => false);

      expect(markerExists).toBe(true);
    });

    it('property: migration idempotency - running twice has same effect', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 3 }),
          async (uuids: string[]) => {
            const tempService = new NostlingService(
              database,
              secretStore,
              path.join(os.tmpdir(), `test-${Date.now()}`),
            );

            const createdIdentities: string[] = [];
            for (const uuid of uuids) {
              const id = await tempService.createIdentity({
                label: `Test ${uuid}`,
                nsec: 'secret',
                npub: `npub-${uuid}`,
              });
              createdIdentities.push(id.id);
            }

            const identities = await tempService.listIdentities();

            // Run migration multiple times
            await tempService['relayConfigManager'].migrateFromDatabase(database, identities);
            const relays1 = await Promise.all(
              createdIdentities.map((id) => tempService.getRelaysForIdentity(id)),
            );

            await tempService['relayConfigManager'].migrateFromDatabase(database, identities);
            const relays2 = await Promise.all(
              createdIdentities.map((id) => tempService.getRelaysForIdentity(id)),
            );

            // Results should be identical
            expect(relays1).toEqual(relays2);
          },
        ),
        { numRuns: 5 },
      );
    });

    it('after migration, relay files exist with correct structure', async () => {
      const identity = await service.createIdentity({ label: 'Test', nsec: 'secret', npub: 'npub1' });

      // Add relays to database before migration
      database.run('INSERT INTO nostr_relays (id, identity_id, url) VALUES (?, ?, ?)', [
        'r1',
        identity.id,
        'wss://relay1.example.com',
      ]);
      database.run('INSERT INTO nostr_relays (id, identity_id, url) VALUES (?, ?, ?)', [
        'r2',
        identity.id,
        'wss://relay2.example.com',
      ]);

      // Run migration
      const identities = await service.listIdentities();
      await service['relayConfigManager'].migrateFromDatabase(database, identities);

      // Load relays and verify they have proper structure
      const relays = await service.getRelaysForIdentity(identity.id);
      relays.forEach((relay) => {
        expect(relay.url).toBeDefined();
        expect(relay.read).toBe(true);
        expect(relay.write).toBe(true);
        expect(relay.order).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Per-Identity Relay Isolation', () => {
    it('property: different identities maintain independent configurations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 4 }),
          async (uuids: string[]) => {
            const identities: string[] = [];

            for (const uuid of uuids) {
              const identity = await service.createIdentity({
                label: `Identity ${uuid}`,
                nsec: 'secret',
                npub: `npub-${uuid}`,
              });
              identities.push(identity.id);
            }

            // Set different relay configurations for each identity
            for (let i = 0; i < identities.length; i++) {
              const relays: NostlingRelayEndpoint[] = [
                {
                  url: `wss://relay-identity-${i}-1.example.com`,
                  read: true,
                  write: true,
                  order: 0,
                },
                {
                  url: `wss://relay-identity-${i}-2.example.com`,
                  read: true,
                  write: true,
                  order: 1,
                },
              ];

              const result = await service.setRelaysForIdentity(identities[i], relays);
              expect(result.config).toBeDefined();
              expect(result.conflict).toBeUndefined();
            }

            // Verify each identity has its own relays
            for (let i = 0; i < identities.length; i++) {
              const relays = await service.getRelaysForIdentity(identities[i]);
              expect(relays).toHaveLength(2);
              expect(relays[0].url).toBe(`wss://relay-identity-${i}-1.example.com`);
              expect(relays[1].url).toBe(`wss://relay-identity-${i}-2.example.com`);
            }
          },
        ),
        { numRuns: 3 },
      );
    });

    it('modifying one identity relays does not affect others', async () => {
      const identity1 = await service.createIdentity({ label: 'Identity 1', nsec: 'secret1', npub: 'npub1' });
      const identity2 = await service.createIdentity({ label: 'Identity 2', nsec: 'secret2', npub: 'npub2' });

      // Get original relays for identity2
      const identity2OriginalRelays = await service.getRelaysForIdentity(identity2.id);

      // Modify identity1 relays
      const modifiedRelays: NostlingRelayEndpoint[] = [
        { url: 'wss://custom-relay.example.com', read: true, write: true, order: 0 },
      ];
      await service.setRelaysForIdentity(identity1.id, modifiedRelays);

      // Verify identity2 relays are unchanged
      const identity2CurrentRelays = await service.getRelaysForIdentity(identity2.id);
      expect(identity2CurrentRelays).toEqual(identity2OriginalRelays);
    });
  });

  describe('Conflict Detection and Error Propagation', () => {
    it('external file modifications are detected as conflicts', async () => {
      const identity = await service.createIdentity({ label: 'Test', nsec: 'secret', npub: 'npub1' });

      // Load and set relays
      const relays = await service.getRelaysForIdentity(identity.id);
      expect(relays.length).toBeGreaterThan(0);

      // Manually modify the file externally
      const configPath = service['relayConfigManager'].getIdentityConfigPath(identity.id);
      const externalRelays: NostlingRelayEndpoint[] = [
        { url: 'wss://externally-modified.example.com', read: true, write: false, order: 0 },
      ];
      await fs.writeFile(configPath, JSON.stringify(externalRelays, null, 2), 'utf-8');

      // Now try to set relays - should detect conflict
      const modifiedRelays: NostlingRelayEndpoint[] = [
        { url: 'wss://our-relay.example.com', read: true, write: true, order: 0 },
      ];
      const result = await service.setRelaysForIdentity(identity.id, modifiedRelays);

      expect(result.conflict).toBeDefined();
      expect(result.conflict?.conflicted).toBe(true);
      expect(result.config).toBeUndefined();
    });

    it('reload discards cached state and reads fresh from disk', async () => {
      const identity = await service.createIdentity({ label: 'Test', nsec: 'secret', npub: 'npub1' });

      // Load initial relays
      let relays = await service.getRelaysForIdentity(identity.id);
      const originalUrl = relays[0].url;

      // Manually modify the file externally
      const configPath = service['relayConfigManager'].getIdentityConfigPath(identity.id);
      const externalRelays: NostlingRelayEndpoint[] = [
        { url: 'wss://externally-modified.example.com', read: true, write: false, order: 0 },
      ];
      await fs.writeFile(configPath, JSON.stringify(externalRelays, null, 2), 'utf-8');

      // Reload should get the external changes
      relays = await service.reloadRelaysForIdentity(identity.id);

      expect(relays[0].url).toBe('wss://externally-modified.example.com');
      expect(relays[0].url).not.toBe(originalUrl);
    });

    it('property: malformed config files are handled gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(fc.nat({ max: 100 }), { minLength: 1, maxLength: 10 }), async (junkData: number[]) => {
          const uniqueNpub = `npub-${Date.now()}-${Math.random()}`;
          const identity = await service.createIdentity({ label: 'Test', nsec: 'secret', npub: uniqueNpub });

          // Write malformed JSON to the config file
          const configPath = service['relayConfigManager'].getIdentityConfigPath(identity.id);
          const malformedJson = '{invalid json' + junkData.join(',');
          await fs.writeFile(configPath, malformedJson, 'utf-8');

          // Should handle gracefully and return empty array with warning log
          const relays = await service.getRelaysForIdentity(identity.id);
          expect(relays).toEqual([]);
          expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('Malformed relay config'));
        }),
        { numRuns: 5 },
      );
    });
  });

  describe('Relay Sorting and Ordering', () => {
    it('property: relays are always sorted by order field', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.nat({ max: 100 }), { minLength: 1, maxLength: 20 }),
          async (orderValues: number[]) => {
            const uniqueNpub = `npub-${Date.now()}-${Math.random()}`;
            const identity = await service.createIdentity({ label: 'Test', nsec: 'secret', npub: uniqueNpub });

            // Create relays with specific order values
            const relays: NostlingRelayEndpoint[] = orderValues.map((order, idx) => ({
              url: `wss://relay-${idx}.example.com`,
              read: true,
              write: true,
              order,
            }));

            // Set relays
            await service.setRelaysForIdentity(identity.id, relays);

            // Get relays and verify they're sorted
            const fetchedRelays = await service.getRelaysForIdentity(identity.id);

            for (let i = 1; i < fetchedRelays.length; i++) {
              expect(fetchedRelays[i].order).toBeGreaterThanOrEqual(fetchedRelays[i - 1].order);
            }
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  describe('Filesystem Error Handling', () => {
    it('creates directories when they do not exist', async () => {
      // Use a deeply nested path
      const deepTempDir = path.join(tempDir, 'deep', 'nested', 'path', 'structure');
      const nestedService = new NostlingService(database, secretStore, deepTempDir);

      const identity = await nestedService.createIdentity({ label: 'Test', nsec: 'secret', npub: 'npub1' });

      // Should not throw error
      const relays = await nestedService.getRelaysForIdentity(identity.id);
      expect(relays).toBeDefined();

      // Verify directories were created
      const configPath = nestedService['relayConfigManager'].getIdentityConfigPath(identity.id);
      const stat = await fs.stat(path.dirname(configPath)).catch(() => null);
      expect(stat?.isDirectory()).toBe(true);
    });

    it('property: preserves relay data integrity through file operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string(), { minLength: 1, maxLength: 100 }),
          async (relayUrls: string[]) => {
            // Filter to valid URLs (prefix with wss to make them look like relay URLs)
            const validUrls = relayUrls
              .filter((url) => url.length > 0 && !url.includes('\x00'))
              .map((url) => `wss://${url}`)
              .slice(0, 10);

            if (validUrls.length === 0) return;

            const uniqueNpub = `npub-${Date.now()}-${Math.random()}`;
            const identity = await service.createIdentity({ label: 'Test', nsec: 'secret', npub: uniqueNpub });

            // Create relays with various URLs
            const relays: NostlingRelayEndpoint[] = validUrls.map((url, idx) => ({
              url,
              read: true,
              write: true,
              order: idx,
            }));

            // Set and retrieve
            const setResult = await service.setRelaysForIdentity(identity.id, relays);
            expect(setResult.config).toBeDefined();

            const fetchedRelays = await service.getRelaysForIdentity(identity.id);
            expect(fetchedRelays).toHaveLength(relays.length);

            // Verify each URL is preserved
            for (let i = 0; i < validUrls.length; i++) {
              expect(fetchedRelays[i].url).toBe(validUrls[i]);
            }
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  describe('Default Relays Initialization', () => {
    it('new identities get DEFAULT_RELAYS assigned', async () => {
      const identity = await service.createIdentity({ label: 'New Identity', nsec: 'secret', npub: 'npub1' });

      const relays = await service.getRelaysForIdentity(identity.id);

      // Should have received DEFAULT_RELAYS
      expect(relays.length).toBe(DEFAULT_RELAYS.length);
      for (let i = 0; i < DEFAULT_RELAYS.length; i++) {
        expect(relays[i].url).toBe(DEFAULT_RELAYS[i].url);
        expect(relays[i].read).toBe(DEFAULT_RELAYS[i].read);
        expect(relays[i].write).toBe(DEFAULT_RELAYS[i].write);
        expect(relays[i].order).toBe(DEFAULT_RELAYS[i].order);
      }
    });

    it('property: missing relay config files are auto-created with defaults', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
          async (uuids: string[]) => {
            const createdIds: string[] = [];

            for (const uuid of uuids) {
              const identity = await service.createIdentity({
                label: `Identity ${uuid}`,
                nsec: 'secret',
                npub: `npub-${uuid}`,
              });
              createdIds.push(identity.id);
            }

            for (const id of createdIds) {
              // Delete the relay config file to simulate missing file
              const configPath = service['relayConfigManager'].getIdentityConfigPath(id);
              await fs.unlink(configPath).catch(() => {
                /* ignore if doesn't exist */
              });

              // Load should recreate it with defaults
              const relays = await service.getRelaysForIdentity(id);

              expect(relays).toEqual(DEFAULT_RELAYS);

              // Verify file now exists
              const fileExists = await fs
                .access(configPath)
                .then(() => true)
                .catch(() => false);
              expect(fileExists).toBe(true);
            }
          },
        ),
        { numRuns: 3 },
      );
    });
  });

  describe('Hash-Based Overwrite Protection', () => {
    it('consecutive saves with no external changes succeed', async () => {
      const identity = await service.createIdentity({ label: 'Test', nsec: 'secret', npub: 'npub1' });

      const relays1: NostlingRelayEndpoint[] = [
        { url: 'wss://relay1.example.com', read: true, write: true, order: 0 },
      ];
      const result1 = await service.setRelaysForIdentity(identity.id, relays1);
      expect(result1.config).toBeDefined();
      expect(result1.conflict).toBeUndefined();

      const relays2: NostlingRelayEndpoint[] = [
        { url: 'wss://relay2.example.com', read: true, write: true, order: 0 },
      ];
      const result2 = await service.setRelaysForIdentity(identity.id, relays2);
      expect(result2.config).toBeDefined();
      expect(result2.conflict).toBeUndefined();
    });

    it('hash is updated after successful write', async () => {
      const identity = await service.createIdentity({ label: 'Test', nsec: 'secret', npub: 'npub1' });

      const relays: NostlingRelayEndpoint[] = [
        { url: 'wss://relay.example.com', read: true, write: true, order: 0 },
      ];

      const manager = service['relayConfigManager'];
      const result = await manager.saveRelays(identity.id, relays);
      expect(result.config).toBeDefined();

      // Save again with same data - should succeed (hash matches)
      const result2 = await manager.saveRelays(identity.id, relays);
      expect(result2.config).toBeDefined();
      expect(result2.conflict).toBeUndefined();
    });
  });
});
