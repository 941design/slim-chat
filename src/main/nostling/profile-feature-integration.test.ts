/**
 * Profile Feature Integration Tests
 *
 * End-to-end integration tests for private profile sharing feature.
 * Tests complete workflows from addContact through profile distribution.
 *
 * Coverage:
 * - AC1: Add contact triggers profile send
 * - AC3: Update profile triggers broadcast to all contacts
 * - AC4: Receive profile updates stored data
 * - AC6: Display name precedence enforced
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';

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
import * as fc from 'fast-check';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { randomUUID } from 'crypto';
import { runMigrations } from '../database/migrations';
import {
  updatePrivateProfile,
  sendPrivateProfileOnAddContact,
  getDisplayNameForContact,
} from './profile-service-integration';
import { handleReceivedWrappedEvent } from './profile-receiver';
import { buildPrivateProfileEvent } from './profile-event-builder';
import { deriveKeypair, generateKeypair, npubToHex, hexToNpub } from './crypto';
import { RelayPool, PublishResult } from './relay-pool';
import { ProfileContent, PRIVATE_PROFILE_KIND } from '../../shared/profile-types';
import { wrapEvent } from 'nostr-tools/nip59';

// ============================================================================
// Test Utilities
// ============================================================================

class MockSecretStore {
  public readonly kind = 'local' as const;
  private secrets = new Map<string, string>();

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

  async loadSecret(ref: string): Promise<string> {
    const secret = this.secrets.get(ref);
    if (!secret) throw new Error(`Secret not found: ${ref}`);
    return secret;
  }

  storeIdentitySecret(identityId: string, nsec: string): void {
    this.secrets.set(`identity-${identityId}`, nsec);
  }
}

class MockRelayPool extends RelayPool {
  public publishedEvents: Array<{ event: any; results: PublishResult[] }> = [];

  async publish(event: any): Promise<PublishResult[]> {
    const results: PublishResult[] = [
      {
        relay: 'wss://relay.example.com',
        success: true,
        message: 'Event published successfully',
      },
    ];
    this.publishedEvents.push({ event, results });
    return results;
  }

  clearHistory(): void {
    this.publishedEvents = [];
  }
}

interface TestIdentity {
  id: string;
  npub: string;
  nsec: string;
  pubkeyHex: string;
  secretKey: Uint8Array;
}

interface TestContact {
  id: string;
  identityId: string;
  npub: string;
  pubkeyHex: string;
  alias: string;
}

function createTestIdentity(database: Database, label: string, secretStore: MockSecretStore): TestIdentity {
  const { keypair, nsec } = generateKeypair();
  const id = randomUUID();
  const now = new Date().toISOString();

  database.run(
    'INSERT INTO nostr_identities (id, npub, secret_ref, label, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, keypair.npub, `identity-${id}`, label, now]
  );

  secretStore.storeIdentitySecret(id, nsec);

  return {
    id,
    npub: keypair.npub,
    nsec,
    pubkeyHex: keypair.pubkeyHex,
    secretKey: keypair.secretKey,
  };
}

function createTestContact(
  database: Database,
  identityId: string,
  alias: string
): TestContact {
  const { keypair } = generateKeypair();
  const id = randomUUID();
  const now = new Date().toISOString();

  database.run(
    'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, identityId, keypair.npub, alias, 'connected', now]
  );

  return {
    id,
    identityId,
    npub: keypair.npub,
    pubkeyHex: keypair.pubkeyHex,
    alias,
  };
}

function storePrivateProfile(
  database: Database,
  pubkeyHex: string,
  content: ProfileContent,
  source: 'private_authored' | 'private_received'
): void {
  const id = randomUUID();
  const now = new Date().toISOString();

  database.run(
    'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, valid_signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, pubkeyHex, source, JSON.stringify(content), 1, now, now]
  );
}

function storePublicProfile(database: Database, pubkeyHex: string, content: ProfileContent): void {
  const id = randomUUID();
  const now = new Date().toISOString();

  database.run(
    'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, valid_signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, pubkeyHex, 'public_discovered', JSON.stringify(content), 1, now, now]
  );
}

// ============================================================================
// Test Suite
// ============================================================================

let SQL: SqlJsStatic;
let database: Database;
let secretStore: MockSecretStore;
let relayPool: MockRelayPool;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(async () => {
  database = new SQL.Database();
  await runMigrations(database);
  secretStore = new MockSecretStore();
  relayPool = new MockRelayPool();
});

afterEach(() => {
  database.close();
});

describe('Profile Feature Integration', () => {
  describe('AC1: Add contact triggers profile send', () => {
    it('integration: addContact sends private profile to new contact', async () => {
      const identity = createTestIdentity(database, 'Alice', secretStore);
      const profileContent: ProfileContent = {
        name: 'Alice Smith',
        about: 'Test user',
        picture: 'https://example.com/alice.jpg',
      };

      storePrivateProfile(database, identity.pubkeyHex, profileContent, 'private_authored');

      const contact = createTestContact(database, identity.id, 'Bob');

      const sendResult = await sendPrivateProfileOnAddContact(
        identity.id,
        contact.pubkeyHex,
        database,
        secretStore,
        relayPool
      );

      expect(sendResult.success).toBe(true);
      expect(sendResult.contactPubkey).toBe(contact.pubkeyHex);
      expect(sendResult.skipped).toBeUndefined();

      const sendStateStmt = database.prepare(
        'SELECT last_sent_profile_hash FROM nostr_profile_send_state WHERE identity_pubkey = ? AND contact_pubkey = ?'
      );
      sendStateStmt.bind([identity.pubkeyHex, contact.pubkeyHex]);
      const hasSendState = sendStateStmt.step();
      expect(hasSendState).toBe(true);
      sendStateStmt.free();

      expect(relayPool.publishedEvents.length).toBe(1);
      const publishedEvent = relayPool.publishedEvents[0].event;
      expect(publishedEvent.kind).toBe(1059);
    });

    it('integration: addContact skips if no profile exists', async () => {
      const identity = createTestIdentity(database, 'Alice', secretStore);
      const contact = createTestContact(database, identity.id, 'Bob');

      const sendResult = await sendPrivateProfileOnAddContact(
        identity.id,
        contact.pubkeyHex,
        database,
        secretStore,
        relayPool
      );

      expect(sendResult.success).toBe(true);
      expect(sendResult.skipped).toBe(true);
      expect(relayPool.publishedEvents.length).toBe(0);
    });

    it('integration: addContact is idempotent - skips if already sent', async () => {
      const identity = createTestIdentity(database, 'Alice', secretStore);
      const profileContent: ProfileContent = { name: 'Alice Smith' };

      storePrivateProfile(database, identity.pubkeyHex, profileContent, 'private_authored');

      const contact = createTestContact(database, identity.id, 'Bob');

      await sendPrivateProfileOnAddContact(
        identity.id,
        contact.pubkeyHex,
        database,
        secretStore,
        relayPool
      );

      relayPool.clearHistory();

      const sendResult2 = await sendPrivateProfileOnAddContact(
        identity.id,
        contact.pubkeyHex,
        database,
        secretStore,
        relayPool
      );

      expect(sendResult2.success).toBe(true);
      expect(sendResult2.skipped).toBe(true);
      expect(relayPool.publishedEvents.length).toBe(0);
    });
  });

  describe('AC3: Update profile triggers broadcast', () => {
    it('integration: updatePrivateProfile sends to all contacts', async () => {
      const identity = createTestIdentity(database, 'Alice', secretStore);
      const contact1 = createTestContact(database, identity.id, 'Bob');
      const contact2 = createTestContact(database, identity.id, 'Carol');
      const contact3 = createTestContact(database, identity.id, 'Dave');

      const profileContent: ProfileContent = {
        name: 'Alice Updated',
        about: 'New bio',
      };

      const result = await updatePrivateProfile(
        { identityId: identity.id, content: profileContent },
        database,
        secretStore,
        relayPool
      );

      expect(result.profile).toBeDefined();
      expect(result.profile.content.name).toBe('Alice Updated');
      expect(result.sendResults.length).toBe(3);

      const successfulSends = result.sendResults.filter((r) => r.success);
      expect(successfulSends.length).toBe(3);

      const sentPubkeys = result.sendResults.map((r) => r.contactPubkey).sort();
      expect(sentPubkeys).toEqual(
        [contact1.pubkeyHex, contact2.pubkeyHex, contact3.pubkeyHex].sort()
      );

      expect(relayPool.publishedEvents.length).toBe(3);
    });

    it('integration: updatePrivateProfile updates all send states', async () => {
      const identity = createTestIdentity(database, 'Alice', secretStore);
      const contact1 = createTestContact(database, identity.id, 'Bob');
      const contact2 = createTestContact(database, identity.id, 'Carol');

      const profileContent: ProfileContent = { name: 'Alice V2' };

      await updatePrivateProfile(
        { identityId: identity.id, content: profileContent },
        database,
        secretStore,
        relayPool
      );

      const sendStateStmt = database.prepare(
        'SELECT contact_pubkey, last_sent_profile_hash FROM nostr_profile_send_state WHERE identity_pubkey = ?'
      );
      sendStateStmt.bind([identity.pubkeyHex]);

      const sendStates: Array<{ contact_pubkey: string; last_sent_profile_hash: string }> = [];
      while (sendStateStmt.step()) {
        const row = sendStateStmt.getAsObject() as any;
        sendStates.push(row);
      }
      sendStateStmt.free();

      expect(sendStates.length).toBe(2);

      const hash1 = sendStates.find((s) => s.contact_pubkey === contact1.pubkeyHex)
        ?.last_sent_profile_hash;
      const hash2 = sendStates.find((s) => s.contact_pubkey === contact2.pubkeyHex)
        ?.last_sent_profile_hash;

      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
      expect(hash1).toBe(hash2);
    });
  });

  describe('AC4: Receive profile updates stored data', () => {
    it('integration: receiving private profile updates stored data', async () => {
      const sender = createTestIdentity(database, 'Sender', secretStore);
      const receiver = createTestIdentity(database, 'Receiver', secretStore);

      const profileContent: ProfileContent = {
        name: 'Sender Profile',
        about: 'Bio text',
        picture: 'https://example.com/pic.jpg',
      };

      const senderKeypair = deriveKeypair(sender.nsec);
      const profileEvent = buildPrivateProfileEvent(profileContent, senderKeypair);

      const wrappedEvent = wrapEvent(profileEvent, senderKeypair.secretKey, receiver.pubkeyHex);

      const storedProfile = await handleReceivedWrappedEvent(
        wrappedEvent,
        receiver.secretKey,
        database
      );

      expect(storedProfile).not.toBeNull();
      expect(storedProfile!.source).toBe('private_received');
      expect(storedProfile!.ownerPubkey).toBe(sender.pubkeyHex);
      expect(storedProfile!.content.name).toBe('Sender Profile');
      expect(storedProfile!.content.about).toBe('Bio text');

      const profileStmt = database.prepare(
        'SELECT content_json FROM nostr_profiles WHERE owner_pubkey = ? AND source = ?'
      );
      profileStmt.bind([sender.pubkeyHex, 'private_received']);
      const hasProfile = profileStmt.step();
      expect(hasProfile).toBe(true);
      const row = profileStmt.getAsObject() as { content_json: string };
      const content = JSON.parse(row.content_json);
      expect(content.name).toBe('Sender Profile');
      profileStmt.free();
    });

    it('integration: receiving profile replaces previous version', async () => {
      const sender = createTestIdentity(database, 'Sender', secretStore);
      const receiver = createTestIdentity(database, 'Receiver', secretStore);

      const oldContent: ProfileContent = { name: 'Old Name' };
      storePrivateProfile(database, sender.pubkeyHex, oldContent, 'private_received');

      const newContent: ProfileContent = { name: 'New Name', about: 'Updated' };
      const senderKeypair = deriveKeypair(sender.nsec);
      const profileEvent = buildPrivateProfileEvent(newContent, senderKeypair);
      const wrappedEvent = wrapEvent(profileEvent, senderKeypair.secretKey, receiver.pubkeyHex);

      await handleReceivedWrappedEvent(wrappedEvent, receiver.secretKey, database);

      const profileStmt = database.prepare(
        'SELECT COUNT(*) as count FROM nostr_profiles WHERE owner_pubkey = ? AND source = ?'
      );
      profileStmt.bind([sender.pubkeyHex, 'private_received']);
      profileStmt.step();
      const count = (profileStmt.getAsObject() as { count: number }).count;
      profileStmt.free();

      expect(count).toBe(1);
    });
  });

  describe('AC6: Display name precedence enforced', () => {
    it('integration: display name precedence alias > private > public > npub', async () => {
      const identity = createTestIdentity(database, 'Alice', secretStore);

      const contact1 = createTestContact(database, identity.id, 'Custom Alias');
      storePrivateProfile(database, contact1.pubkeyHex, { name: 'Private Name' }, 'private_received');
      storePublicProfile(database, contact1.pubkeyHex, { name: 'Public Name' });

      const resolution1 = getDisplayNameForContact(contact1.id, database);
      expect(resolution1.source).toBe('alias');
      expect(resolution1.displayName).toBe('Custom Alias');

      const contact2 = createTestContact(database, identity.id, '');
      database.run('UPDATE nostr_contacts SET alias = ? WHERE id = ?', ['', contact2.id]);
      storePrivateProfile(database, contact2.pubkeyHex, { name: 'Private Name 2' }, 'private_received');
      storePublicProfile(database, contact2.pubkeyHex, { name: 'Public Name 2' });

      const resolution2 = getDisplayNameForContact(contact2.id, database);
      expect(resolution2.source).toBe('private');
      expect(resolution2.displayName).toBe('Private Name 2');

      const contact3 = createTestContact(database, identity.id, '');
      database.run('UPDATE nostr_contacts SET alias = ? WHERE id = ?', ['', contact3.id]);
      storePublicProfile(database, contact3.pubkeyHex, { name: 'Public Name 3' });

      const resolution3 = getDisplayNameForContact(contact3.id, database);
      expect(resolution3.source).toBe('public');
      expect(resolution3.displayName).toBe('Public Name 3');

      const contact4 = createTestContact(database, identity.id, '');
      database.run('UPDATE nostr_contacts SET alias = ? WHERE id = ?', ['', contact4.id]);

      const resolution4 = getDisplayNameForContact(contact4.id, database);
      expect(resolution4.source).toBe('npub');
      expect(resolution4.displayName).toContain('npub1');
    });

    it('integration: display name uses display_name fallback', async () => {
      const identity = createTestIdentity(database, 'Alice', secretStore);
      const contact = createTestContact(database, identity.id, '');
      database.run('UPDATE nostr_contacts SET alias = ? WHERE id = ?', ['', contact.id]);

      storePrivateProfile(
        database,
        contact.pubkeyHex,
        { display_name: 'Display Fallback' },
        'private_received'
      );

      const resolution = getDisplayNameForContact(contact.id, database);
      expect(resolution.source).toBe('private');
      expect(resolution.displayName).toBe('Display Fallback');
    });
  });

  describe('Property: Add N contacts → profile sent to all N', () => {
    it('property: sending to N contacts creates N send states', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (contactCount) => {
            const testDb = new SQL.Database();
            await runMigrations(testDb);
            const testSecretStore = new MockSecretStore();
            const testRelayPool = new MockRelayPool();

            const identity = createTestIdentity(testDb, 'Test Identity', testSecretStore);
            const profileContent: ProfileContent = { name: 'Test Profile' };
            storePrivateProfile(testDb, identity.pubkeyHex, profileContent, 'private_authored');

            const contacts: TestContact[] = [];
            for (let i = 0; i < contactCount; i++) {
              const contact = createTestContact(testDb, identity.id, `Contact ${i}`);
              contacts.push(contact);
            }

            for (const contact of contacts) {
              await sendPrivateProfileOnAddContact(
                identity.id,
                contact.pubkeyHex,
                testDb,
                testSecretStore,
                testRelayPool
              );
            }

            const sendStateStmt = testDb.prepare(
              'SELECT COUNT(*) as count FROM nostr_profile_send_state WHERE identity_pubkey = ?'
            );
            sendStateStmt.bind([identity.pubkeyHex]);
            sendStateStmt.step();
            const count = (sendStateStmt.getAsObject() as { count: number }).count;
            sendStateStmt.free();
            testDb.close();

            expect(count).toBe(contactCount);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property: Update profile M times → all contacts have latest hash', () => {
    it('property: multiple updates result in consistent final hash', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (updateCount) => {
            const testDb = new SQL.Database();
            await runMigrations(testDb);
            const testSecretStore = new MockSecretStore();
            const testRelayPool = new MockRelayPool();

            const identity = createTestIdentity(testDb, 'Test Identity', testSecretStore);
            const contact1 = createTestContact(testDb, identity.id, 'Contact 1');
            const contact2 = createTestContact(testDb, identity.id, 'Contact 2');

            let lastContent: ProfileContent = { name: 'Initial' };
            for (let i = 0; i < updateCount; i++) {
              lastContent = { name: `Version ${i + 1}`, about: `Update ${i}` };
              await updatePrivateProfile(
                { identityId: identity.id, content: lastContent },
                testDb,
                testSecretStore,
                testRelayPool
              );
            }

            const sendStateStmt = testDb.prepare(
              'SELECT last_sent_profile_hash FROM nostr_profile_send_state WHERE identity_pubkey = ?'
            );
            sendStateStmt.bind([identity.pubkeyHex]);

            const hashes: string[] = [];
            while (sendStateStmt.step()) {
              const row = sendStateStmt.getAsObject() as { last_sent_profile_hash: string };
              hashes.push(row.last_sent_profile_hash);
            }
            sendStateStmt.free();
            testDb.close();

            expect(hashes.length).toBe(2);
            expect(hashes[0]).toBe(hashes[1]);
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('Property: Receive profiles from K senders → all stored correctly', () => {
    it('property: receiving K profiles stores K records', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (senderCount) => {
            const testDb = new SQL.Database();
            await runMigrations(testDb);
            const testSecretStore = new MockSecretStore();

            const receiver = createTestIdentity(testDb, 'Receiver', testSecretStore);

            for (let i = 0; i < senderCount; i++) {
              const sender = createTestIdentity(testDb, `Sender ${i}`, testSecretStore);
              const profileContent: ProfileContent = {
                name: `Sender ${i} Profile`,
                about: `Bio for sender ${i}`,
              };

              const senderKeypair = deriveKeypair(sender.nsec);
              const profileEvent = buildPrivateProfileEvent(profileContent, senderKeypair);
              const wrappedEvent = wrapEvent(
                profileEvent,
                senderKeypair.secretKey,
                receiver.pubkeyHex
              );

              await handleReceivedWrappedEvent(wrappedEvent, receiver.secretKey, testDb);
            }

            const profileStmt = testDb.prepare(
              'SELECT COUNT(*) as count FROM nostr_profiles WHERE source = ?'
            );
            profileStmt.bind(['private_received']);
            profileStmt.step();
            const count = (profileStmt.getAsObject() as { count: number }).count;
            profileStmt.free();
            testDb.close();

            expect(count).toBe(senderCount);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
