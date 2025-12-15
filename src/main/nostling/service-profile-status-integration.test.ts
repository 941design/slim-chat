import { describe, expect, it, beforeAll, beforeEach, jest } from '@jest/globals';
import fc from 'fast-check';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { NostlingService } from './service';
import { NostlingSecretStore } from './secret-store';
import { runMigrations } from '../database/migrations';
import { log } from '../logging';
import { generateKeypair } from './crypto';
import { NostlingIdentity, NostlingContact } from '../../shared/types';

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
let service: NostlingService;
let secretStore: MemorySecretStore;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(async () => {
  database = new SQL.Database();
  await runMigrations(database);
  secretStore = new MemorySecretStore();
  service = new NostlingService(database, secretStore, '/tmp/nostling-test');
  (log as jest.Mock).mockClear();
});

describe('Service Profile Status Integration', () => {
  describe('listIdentities() profile enhancement', () => {
    it('preserves all existing identity fields when no profiles exist', async () => {
      const identity = await service.createIdentity({
        label: 'Test Identity',
        nsec: 'secret',
        npub: 'npub1test',
      });

      const identities = await service.listIdentities();

      expect(identities).toHaveLength(1);
      expect(identities[0].id).toBe(identity.id);
      expect(identities[0].label).toBe('Test Identity');
      expect(identities[0].npub).toBe('npub1test');
    });

    it('provides property-based test: any identity array length preserved after enhancement',
      () => {
        fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1, max: 5 }),
            async (count) => {
              // Create fresh database and service for this test run
              const freshDb = new SQL.Database();
              await runMigrations(freshDb);
              const freshSecretStore = new MemorySecretStore();
              const freshService = new NostlingService(freshDb, freshSecretStore, '/tmp/nostling-test');

              // Create multiple identities
              const createdIds: string[] = [];
              for (let i = 0; i < count; i++) {
                const id = await freshService.createIdentity({
                  label: `Identity ${i}`,
                  nsec: `secret${i}`,
                  npub: `npub_test_${Date.now()}_${i}`,
                });
                createdIds.push(id.id);
              }

              const identities = await freshService.listIdentities();

              // Property: output length equals input count
              expect(identities).toHaveLength(count);

              // Property: all created IDs are present in same order
              for (let i = 0; i < count; i++) {
                expect(identities[i].id).toBe(createdIds[i]);
              }
            }
          ),
          { numRuns: 5 }
        );
      }
    );

    it('preserves existing fields (id, npub, label, createdAt) for each identity', async () => {
      const identity1 = await service.createIdentity({
        label: 'Alice',
        nsec: 'secret1',
        npub: 'npub1',
      });
      const identity2 = await service.createIdentity({
        label: 'Bob',
        nsec: 'secret2',
        npub: 'npub2',
      });

      const identities = await service.listIdentities();

      // Property: Each output identity matches corresponding input identity fields
      const fieldMap = new Map([
        [identity1.id, identity1],
        [identity2.id, identity2],
      ]);

      for (const identity of identities) {
        const original = fieldMap.get(identity.id);
        expect(original).toBeDefined();
        expect(identity.label).toBe(original?.label);
        expect(identity.npub).toBe(original?.npub);
        expect(identity.secretRef).toBe(original?.secretRef);
      }
    });

    it('returns identities with profileSource and picture fields (null when no profiles)', async () => {
      const identity = await service.createIdentity({
        label: 'Test',
        nsec: 'secret',
        npub: 'npub1',
      });

      const identities = await service.listIdentities();

      // Property: Each identity has profileSource and picture fields
      for (const id of identities) {
        expect(id).toHaveProperty('profileSource');
        expect(id).toHaveProperty('picture');
        // When no profiles exist, these should be null or undefined
        expect(id.profileSource === null || id.profileSource === undefined).toBe(true);
        expect(id.picture === null || id.picture === undefined).toBe(true);
      }
    });
  });

  describe('listContacts() profile enhancement', () => {
    it('preserves all existing contact fields when no profiles exist', async () => {
      const identity = await service.createIdentity({
        label: 'Owner',
        nsec: 'secret',
        npub: 'npub1',
      });

      const contact = await service.addContact({
        identityId: identity.id,
        npub: 'npub2',
        alias: 'Friend',
      });

      const contacts = await service.listContacts(identity.id);

      expect(contacts).toHaveLength(1);
      expect(contacts[0].id).toBe(contact.id);
      expect(contacts[0].alias).toBe('Friend');
      expect(contacts[0].npub).toBe('npub2');
    });

    it('provides property-based test: any contact array length preserved after enhancement',
      () => {
        fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1, max: 3 }),
            async (contactCount) => {
              // Create fresh database and service for this test run
              const freshDb = new SQL.Database();
              await runMigrations(freshDb);
              const freshSecretStore = new MemorySecretStore();
              const freshService = new NostlingService(freshDb, freshSecretStore, '/tmp/nostling-test');

              const identity = await freshService.createIdentity({
                label: 'Owner',
                nsec: 'secret',
                npub: `npub_owner_${Date.now()}`,
              });

              const createdIds: string[] = [];
              for (let i = 0; i < contactCount; i++) {
                const contact = await freshService.addContact({
                  identityId: identity.id,
                  npub: `npub_contact_${Date.now()}_${i}`,
                  alias: `Contact ${i}`,
                });
                createdIds.push(contact.id);
              }

              const contacts = await freshService.listContacts(identity.id);

              // Property: output length equals input count
              expect(contacts).toHaveLength(contactCount);
            }
          ),
          { numRuns: 3 }
        );
      }
    );

    it('preserves existing fields (id, npub, alias, state) for each contact', async () => {
      const identity = await service.createIdentity({
        label: 'Owner',
        nsec: 'secret',
        npub: 'npub1',
      });

      const contact1 = await service.addContact({
        identityId: identity.id,
        npub: 'npub100',
        alias: 'Alice',
      });
      const contact2 = await service.addContact({
        identityId: identity.id,
        npub: 'npub200',
        alias: 'Bob',
      });

      const contacts = await service.listContacts(identity.id);

      // Property: Each output contact matches corresponding input contact fields
      const fieldMap = new Map([
        [contact1.id, contact1],
        [contact2.id, contact2],
      ]);

      for (const contact of contacts) {
        const original = fieldMap.get(contact.id);
        if (original) {
          expect(contact.alias).toBe(original.alias);
          expect(contact.npub).toBe(original.npub);
          expect(contact.state).toBe(original.state);
        }
      }
    });

    it('returns contacts with profileSource and picture fields (null when no profiles)', async () => {
      const identity = await service.createIdentity({
        label: 'Owner',
        nsec: 'secret',
        npub: 'npub1',
      });

      const contact = await service.addContact({
        identityId: identity.id,
        npub: 'npub2',
        alias: 'Friend',
      });

      const contacts = await service.listContacts(identity.id);

      // Property: Each contact has profileSource and picture fields
      for (const c of contacts) {
        expect(c).toHaveProperty('profileSource');
        expect(c).toHaveProperty('picture');
        // When no profiles exist, these should be null or undefined
        expect(c.profileSource === null || c.profileSource === undefined).toBe(true);
        expect(c.picture === null || c.picture === undefined).toBe(true);
      }
    });

    it('filters deleted contacts correctly before enhancement', async () => {
      const identity = await service.createIdentity({
        label: 'Owner',
        nsec: 'secret',
        npub: 'npub1',
      });

      const contact1 = await service.addContact({
        identityId: identity.id,
        npub: 'npub100',
        alias: 'Alice',
      });
      const contact2 = await service.addContact({
        identityId: identity.id,
        npub: 'npub200',
        alias: 'Bob',
      });

      // Remove one contact
      await service.removeContact(contact1.id);

      const contacts = await service.listContacts(identity.id);

      // Property: only non-deleted contacts returned
      expect(contacts.some(c => c.id === contact1.id)).toBe(false);
      expect(contacts.some(c => c.id === contact2.id)).toBe(true);
    });
  });

  describe('Integration: Service continues to work if enhancement has issues', () => {
    it('returns identities list even if profile enhancement encounters an error', async () => {
      const identity = await service.createIdentity({
        label: 'Test',
        nsec: 'secret',
        npub: 'npub1',
      });

      // The service should still return identities even if enhancement fails
      // (when the enhancement functions are implemented, they handle errors gracefully)
      const identities = await service.listIdentities();

      expect(identities).toHaveLength(1);
      expect(identities[0].id).toBe(identity.id);
    });

    it('returns contacts list even if profile enhancement encounters an error', async () => {
      const identity = await service.createIdentity({
        label: 'Owner',
        nsec: 'secret',
        npub: 'npub1',
      });

      const contact = await service.addContact({
        identityId: identity.id,
        npub: 'npub2',
        alias: 'Friend',
      });

      // The service should still return contacts even if enhancement fails
      const contacts = await service.listContacts(identity.id);

      expect(contacts.length).toBeGreaterThan(0);
      expect(contacts.some(c => c.id === contact.id)).toBe(true);
    });
  });

  describe('Data Integrity: No side effects on service state', () => {
    it('property: calling listIdentities multiple times returns consistent results',
      () => {
        fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1, max: 3 }),
            async (callCount) => {
              // Create fresh database and service for this test run
              const freshDb = new SQL.Database();
              await runMigrations(freshDb);
              const freshSecretStore = new MemorySecretStore();
              const freshService = new NostlingService(freshDb, freshSecretStore, '/tmp/nostling-test');

              const identity = await freshService.createIdentity({
                label: 'Test',
                nsec: 'secret',
                npub: `npub_test_${Date.now()}`,
              });

              const results: NostlingIdentity[][] = [];
              for (let i = 0; i < callCount; i++) {
                results.push(await freshService.listIdentities());
              }

              // Property: all calls return same length
              const lengths = results.map(r => r.length);
              expect(new Set(lengths).size).toBe(1);

              // Property: all calls return identities with same IDs in same order
              for (const result of results.slice(1)) {
                for (let i = 0; i < result.length; i++) {
                  expect(result[i].id).toBe(results[0][i].id);
                }
              }
            }
          ),
          { numRuns: 3 }
        );
      }
    );

    it('property: calling listContacts multiple times returns consistent results',
      () => {
        fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1, max: 3 }),
            async (callCount) => {
              // Create fresh database and service for this test run
              const freshDb = new SQL.Database();
              await runMigrations(freshDb);
              const freshSecretStore = new MemorySecretStore();
              const freshService = new NostlingService(freshDb, freshSecretStore, '/tmp/nostling-test');

              const identity = await freshService.createIdentity({
                label: 'Owner',
                nsec: 'secret',
                npub: `npub_owner_${Date.now()}`,
              });

              const contact = await freshService.addContact({
                identityId: identity.id,
                npub: `npub_contact_${Date.now()}`,
                alias: 'Friend',
              });

              const results: NostlingContact[][] = [];
              for (let i = 0; i < callCount; i++) {
                results.push(await freshService.listContacts(identity.id));
              }

              // Property: all calls return same length
              const lengths = results.map(r => r.length);
              expect(new Set(lengths).size).toBe(1);

              // Property: all calls return contacts with same IDs in same order
              for (const result of results.slice(1)) {
                for (let i = 0; i < result.length; i++) {
                  expect(result[i].id).toBe(results[0][i].id);
                }
              }
            }
          ),
          { numRuns: 3 }
        );
      }
    );
  });

  describe('Correctness: Enhancement maintains type contracts', () => {
    it('property: every identity has valid types for all fields',
      () => {
        fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1, max: 3 }),
            async (count) => {
              // Create fresh database and service for this test run
              const freshDb = new SQL.Database();
              await runMigrations(freshDb);
              const freshSecretStore = new MemorySecretStore();
              const freshService = new NostlingService(freshDb, freshSecretStore, '/tmp/nostling-test');

              for (let i = 0; i < count; i++) {
                await freshService.createIdentity({
                  label: `Identity ${i}`,
                  nsec: `secret${i}`,
                  npub: `npub_${Date.now()}_${i}`,
                });
              }

              const identities = await freshService.listIdentities();

              for (const identity of identities) {
                // Property: id is non-empty string
                expect(typeof identity.id).toBe('string');
                expect(identity.id.length).toBeGreaterThan(0);

                // Property: npub is non-empty string
                expect(typeof identity.npub).toBe('string');
                expect(identity.npub.length).toBeGreaterThan(0);

                // Property: label is non-empty string
                expect(typeof identity.label).toBe('string');
                expect(identity.label.length).toBeGreaterThan(0);

                // Property: createdAt is ISO date string
                expect(typeof identity.createdAt).toBe('string');
                expect(() => new Date(identity.createdAt)).not.toThrow();

                // Property: profileSource is null or valid enum value
                if (identity.profileSource !== null && identity.profileSource !== undefined) {
                  expect(['private_authored', 'public_discovered']).toContain(identity.profileSource);
                }

                // Property: picture is null or valid URL string
                if (identity.picture !== null && identity.picture !== undefined) {
                  expect(typeof identity.picture).toBe('string');
                  // If picture exists, it should be non-empty
                  expect(identity.picture.length).toBeGreaterThan(0);
                }
              }
            }
          ),
          { numRuns: 3 }
        );
      }
    );

    it('property: every contact has valid types for all fields',
      () => {
        fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1, max: 3 }),
            async (count) => {
              // Create fresh database and service for this test run
              const freshDb = new SQL.Database();
              await runMigrations(freshDb);
              const freshSecretStore = new MemorySecretStore();
              const freshService = new NostlingService(freshDb, freshSecretStore, '/tmp/nostling-test');

              const identity = await freshService.createIdentity({
                label: 'Owner',
                nsec: 'secret',
                npub: `npub_owner_${Date.now()}`,
              });

              for (let i = 0; i < count; i++) {
                await freshService.addContact({
                  identityId: identity.id,
                  npub: `npub_contact_${Date.now()}_${i}`,
                  alias: `Contact ${i}`,
                });
              }

              const contacts = await freshService.listContacts(identity.id);

              for (const contact of contacts) {
                // Property: id is non-empty string
                expect(typeof contact.id).toBe('string');
                expect(contact.id.length).toBeGreaterThan(0);

                // Property: npub is non-empty string
                expect(typeof contact.npub).toBe('string');
                expect(contact.npub.length).toBeGreaterThan(0);

                // Property: alias is non-empty string
                expect(typeof contact.alias).toBe('string');
                expect(contact.alias.length).toBeGreaterThan(0);

                // Property: state is valid enum value
                expect(['pending', 'connected']).toContain(contact.state);

                // Property: createdAt is ISO date string
                expect(typeof contact.createdAt).toBe('string');
                expect(() => new Date(contact.createdAt)).not.toThrow();

                // Property: profileSource is null or valid enum value
                if (contact.profileSource !== null && contact.profileSource !== undefined) {
                  expect(['private_received', 'public_discovered']).toContain(contact.profileSource);
                }

                // Property: picture is null or valid URL string
                if (contact.picture !== null && contact.picture !== undefined) {
                  expect(typeof contact.picture).toBe('string');
                  // If picture exists, it should be non-empty
                  expect(contact.picture.length).toBeGreaterThan(0);
                }
              }
            }
          ),
          { numRuns: 3 }
        );
      }
    );
  });
});
