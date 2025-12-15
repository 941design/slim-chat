/**
 * Property-based tests for profile-receiver.ts
 *
 * Tests verify NIP-59 unwrapping, signature validation, and profile storage.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import initSqlJs, { Database } from 'sql.js';
import { handleReceivedWrappedEvent, getProfileForPubkey, getAllProfilesForPubkey } from './profile-receiver';
import { ProfileContent, PRIVATE_PROFILE_KIND, ProfileRecord } from '../../shared/profile-types';
import { NostrEvent } from './crypto';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { wrapEvent } from 'nostr-tools/nip59';

let dbModule: any;

async function createFreshDatabase(): Promise<Database> {
  if (!dbModule) {
    dbModule = await initSqlJs();
  }
  const database = new dbModule.Database();

  database.run(`
    CREATE TABLE nostr_profiles (
      id TEXT PRIMARY KEY,
      owner_pubkey TEXT NOT NULL,
      source TEXT NOT NULL,
      content_json TEXT NOT NULL,
      event_id TEXT,
      valid_signature INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  database.run(`
    CREATE INDEX idx_nostr_profiles_owner_source ON nostr_profiles(owner_pubkey, source)
  `);

  return database;
}

let db: Database;

beforeEach(async () => {
  db = await createFreshDatabase();
});

afterEach(() => {
  if (db) {
    try {
      db.close();
    } catch {
      // already closed
    }
  }
});

const profileContentArb = fc.record({
  name: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  display_name: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  about: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
  picture: fc.option(fc.webUrl(), { nil: undefined }),
  banner: fc.option(fc.webUrl(), { nil: undefined }),
  website: fc.option(fc.webUrl(), { nil: undefined }),
  nip05: fc.option(fc.emailAddress(), { nil: undefined }),
  lud16: fc.option(fc.emailAddress(), { nil: undefined })
});

const pubkeyArb = fc.stringMatching(/^[0-9a-f]{64}$/);

async function createWrappedProfileEvent(
  senderSecretKey: Uint8Array,
  recipientPubkey: string,
  content: ProfileContent
): Promise<NostrEvent> {
  const innerEventTemplate = {
    kind: PRIVATE_PROFILE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(content)
  };

  const wrappedEvent = wrapEvent(innerEventTemplate, senderSecretKey, recipientPubkey);
  return wrappedEvent as NostrEvent;
}

describe('Profile Receiver', () => {
  describe('handleReceivedWrappedEvent', () => {
    it('P001: Unwraps valid NIP-59 profile and stores with correct source', async () => {
      await fc.assert(
        fc.asyncProperty(profileContentArb, async (content) => {
          const senderSK = generateSecretKey();
          const recipientSK = generateSecretKey();
          const recipientPK = getPublicKey(recipientSK);

          const wrappedEvent = await createWrappedProfileEvent(senderSK, recipientPK, content);
          const result = await handleReceivedWrappedEvent(wrappedEvent, recipientSK, db);

          expect(result).not.toBeNull();
          expect(result!.source).toBe('private_received');
          expect(result!.ownerPubkey).toBe(getPublicKey(senderSK));
          expect(result!.content).toEqual(content);
          expect(result!.validSignature).toBe(true);
        }),
        { numRuns: 20 }
      );
    });

    it('P002: Rejects non-profile events (returns null for other kinds)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 65535 }).filter(k => k !== PRIVATE_PROFILE_KIND),
          fc.string(),
          async (kind, content) => {
            const senderSK = generateSecretKey();
            const recipientSK = generateSecretKey();
            const recipientPK = getPublicKey(recipientSK);

            const innerEventTemplate = {
              kind,
              created_at: Math.floor(Date.now() / 1000),
              tags: [],
              content
            };

            const wrappedEvent = wrapEvent(innerEventTemplate, senderSK, recipientPK);
            const result = await handleReceivedWrappedEvent(wrappedEvent as NostrEvent, recipientSK, db);

            expect(result).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('P003: Latest-wins replacement - newer profile replaces older', async () => {
      await fc.assert(
        fc.asyncProperty(profileContentArb, profileContentArb, async (content1, content2) => {
          const senderSK = generateSecretKey();
          const recipientSK = generateSecretKey();
          const recipientPK = getPublicKey(recipientSK);

          const wrapped1 = await createWrappedProfileEvent(senderSK, recipientPK, content1);
          const result1 = await handleReceivedWrappedEvent(wrapped1, recipientSK, db);

          await new Promise(resolve => setTimeout(resolve, 10));

          const wrapped2 = await createWrappedProfileEvent(senderSK, recipientPK, content2);
          const result2 = await handleReceivedWrappedEvent(wrapped2, recipientSK, db);

          expect(result1!.id).toBe(result2!.id);
          expect(result2!.content).toEqual(content2);
          expect(result2!.updatedAt > result1!.updatedAt).toBe(true);

          const retrieved = getProfileForPubkey(getPublicKey(senderSK), 'private_received', db);
          expect(retrieved!.content).toEqual(content2);
        }),
        { numRuns: 15 }
      );
    });

    it('P004: Idempotent - receiving same profile multiple times updates same record', async () => {
      await fc.assert(
        fc.asyncProperty(profileContentArb, async (content) => {
          const senderSK = generateSecretKey();
          const recipientSK = generateSecretKey();
          const recipientPK = getPublicKey(recipientSK);

          const wrappedEvent = await createWrappedProfileEvent(senderSK, recipientPK, content);

          const result1 = await handleReceivedWrappedEvent(wrappedEvent, recipientSK, db);
          const result2 = await handleReceivedWrappedEvent(wrappedEvent, recipientSK, db);
          const result3 = await handleReceivedWrappedEvent(wrappedEvent, recipientSK, db);

          expect(result1!.id).toBe(result2!.id);
          expect(result2!.id).toBe(result3!.id);

          const allProfiles = getAllProfilesForPubkey(getPublicKey(senderSK), db);
          expect(allProfiles).toHaveLength(1);
        }),
        { numRuns: 15 }
      );
    });

    it('E001: Invalid JSON content returns null', async () => {
      const senderSK = generateSecretKey();
      const recipientSK = generateSecretKey();
      const recipientPK = getPublicKey(recipientSK);

      const innerEventTemplate = {
        kind: PRIVATE_PROFILE_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: '{invalid json content'
      };

      const wrappedEvent = wrapEvent(innerEventTemplate, senderSK, recipientPK);
      const result = await handleReceivedWrappedEvent(wrappedEvent as NostrEvent, recipientSK, db);

      expect(result).toBeNull();
    });

    it('E002: Wrong recipient secret key returns null', async () => {
      const senderSK = generateSecretKey();
      const recipientSK = generateSecretKey();
      const wrongSK = generateSecretKey();
      const recipientPK = getPublicKey(recipientSK);

      const content: ProfileContent = { name: 'Test' };
      const wrappedEvent = await createWrappedProfileEvent(senderSK, recipientPK, content);
      const result = await handleReceivedWrappedEvent(wrappedEvent, wrongSK, db);

      expect(result).toBeNull();
    });
  });

  describe('getProfileForPubkey', () => {
    it('P005: Returns null when profile does not exist', () => {
      fc.assert(
        fc.property(pubkeyArb, (pubkey: string) => {
          const result = getProfileForPubkey(pubkey, 'private_received', db);
          expect(result).toBeNull();
        }),
        { numRuns: 30 }
      );
    });

    it('P006: Returns stored profile when it exists', async () => {
      await fc.assert(
        fc.asyncProperty(profileContentArb, async (content) => {
          const senderSK = generateSecretKey();
          const recipientSK = generateSecretKey();
          const recipientPK = getPublicKey(recipientSK);
          const senderPubkey = getPublicKey(senderSK);

          const wrappedEvent = await createWrappedProfileEvent(senderSK, recipientPK, content);
          await handleReceivedWrappedEvent(wrappedEvent, recipientSK, db);

          const result = getProfileForPubkey(senderPubkey, 'private_received', db);
          expect(result).not.toBeNull();
          expect(result!.ownerPubkey).toBe(senderPubkey);
          expect(result!.content).toEqual(content);
          expect(result!.source).toBe('private_received');
        }),
        { numRuns: 20 }
      );
    });

    it('P007: Source-specific - only returns matching source', async () => {
      const senderSK = generateSecretKey();
      const recipientSK = generateSecretKey();
      const recipientPK = getPublicKey(recipientSK);
      const senderPubkey = getPublicKey(senderSK);

      const content: ProfileContent = { name: 'Private' };
      const wrappedEvent = await createWrappedProfileEvent(senderSK, recipientPK, content);
      await handleReceivedWrappedEvent(wrappedEvent, recipientSK, db);

      const privateResult = getProfileForPubkey(senderPubkey, 'private_received', db);
      const publicResult = getProfileForPubkey(senderPubkey, 'public_discovered', db);
      const authoredResult = getProfileForPubkey(senderPubkey, 'private_authored', db);

      expect(privateResult).not.toBeNull();
      expect(publicResult).toBeNull();
      expect(authoredResult).toBeNull();
    });

    it('P008: Latest-only - returns most recent when multiple exist', async () => {
      const senderSK = generateSecretKey();
      const senderPubkey = getPublicKey(senderSK);

      const content1: ProfileContent = { name: 'First' };
      const content2: ProfileContent = { name: 'Second' };

      db.run(
        'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['id1', senderPubkey, 'private_received', JSON.stringify(content1), 'evt1', 1, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z']
      );

      db.run(
        'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['id2', senderPubkey, 'private_received', JSON.stringify(content2), 'evt2', 1, '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z']
      );

      const result = getProfileForPubkey(senderPubkey, 'private_received', db);
      expect(result!.content.name).toBe('Second');
      expect(result!.id).toBe('id2');
    });
  });

  describe('getAllProfilesForPubkey', () => {
    it('P009: Returns empty array when no profiles exist', () => {
      fc.assert(
        fc.property(pubkeyArb, (pubkey: string) => {
          const result = getAllProfilesForPubkey(pubkey, db);
          expect(result).toEqual([]);
        }),
        { numRuns: 30 }
      );
    });

    it('P010: Returns all sources for pubkey', async () => {
      const pubkey = getPublicKey(generateSecretKey());
      const content1: ProfileContent = { name: 'Private Received' };
      const content2: ProfileContent = { name: 'Public Discovered' };
      const content3: ProfileContent = { name: 'Private Authored' };

      db.run(
        'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['id1', pubkey, 'private_received', JSON.stringify(content1), 'evt1', 1, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z']
      );

      db.run(
        'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['id2', pubkey, 'public_discovered', JSON.stringify(content2), 'evt2', 1, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z']
      );

      db.run(
        'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['id3', pubkey, 'private_authored', JSON.stringify(content3), 'evt3', 1, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z']
      );

      const result = getAllProfilesForPubkey(pubkey, db);
      expect(result).toHaveLength(3);
      expect(result.map(p => p.source).sort()).toEqual(['private_authored', 'private_received', 'public_discovered']);
    });

    it('P011: Latest per source - deduplicates by source', async () => {
      const pubkey = getPublicKey(generateSecretKey());
      const content1: ProfileContent = { name: 'First' };
      const content2: ProfileContent = { name: 'Second' };

      db.run(
        'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['id1', pubkey, 'private_received', JSON.stringify(content1), 'evt1', 1, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z']
      );

      db.run(
        'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['id2', pubkey, 'private_received', JSON.stringify(content2), 'evt2', 1, '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z']
      );

      const result = getAllProfilesForPubkey(pubkey, db);
      expect(result).toHaveLength(1);
      expect(result[0].content.name).toBe('Second');
      expect(result[0].id).toBe('id2');
    });

    it('P012: Completeness - returns profiles from multiple sources', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(profileContentArb, { minLength: 1, maxLength: 3 }),
          async (contents) => {
            const senderSK = generateSecretKey();
            const recipientSK = generateSecretKey();
            const recipientPK = getPublicKey(recipientSK);
            const senderPubkey = getPublicKey(senderSK);

            for (const content of contents) {
              const wrappedEvent = await createWrappedProfileEvent(senderSK, recipientPK, content);
              await handleReceivedWrappedEvent(wrappedEvent, recipientSK, db);
            }

            const result = getAllProfilesForPubkey(senderPubkey, db);
            expect(result.length).toBeGreaterThan(0);
            expect(result.length).toBeLessThanOrEqual(3);
            expect(result.every(p => p.ownerPubkey === senderPubkey)).toBe(true);
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('NIP-59 Integrity Properties', () => {
    it('P013: NIP-59 rumor always has validSignature=true (unsigned by design)', async () => {
      await fc.assert(
        fc.asyncProperty(profileContentArb, async (content) => {
          const senderSK = generateSecretKey();
          const recipientSK = generateSecretKey();
          const recipientPK = getPublicKey(recipientSK);
          const senderPubkey = getPublicKey(senderSK);

          const wrappedEvent = await createWrappedProfileEvent(senderSK, recipientPK, content);
          const result = await handleReceivedWrappedEvent(wrappedEvent, recipientSK, db);

          expect(result).not.toBeNull();
          expect(result!.validSignature).toBe(true);

          const retrieved = getProfileForPubkey(senderPubkey, 'private_received', db);
          expect(retrieved!.validSignature).toBe(true);
        }),
        { numRuns: 15 }
      );
    });
  });
});
