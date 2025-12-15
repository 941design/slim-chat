/**
 * Property-Based Tests for Profile Sender
 *
 * Tests NIP-59 wrapping, send-state tracking, and relay publishing.
 * Uses fast-check for property-based testing.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../logging', () => ({
  log: jest.fn(),
}));
import * as fc from 'fast-check';
import initSqlJs, { Database } from 'sql.js';
import { sendProfileToContact, sendProfileToAllContacts, getSendState } from './profile-sender';
import { NostrKeypair, NostrEvent, generateKeypair, npubToHex } from './crypto';
import { PublishResult } from './relay-pool';
import { PRIVATE_PROFILE_KIND, ProfileSendResult } from '../../shared/profile-types';
import { randomUUID } from 'node:crypto';
import { finalizeEvent } from 'nostr-tools/pure';
import { unwrapEvent } from 'nostr-tools/nip59';

// ============================================================================
// Test Database Setup
// ============================================================================

async function createTestDatabase(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE nostr_profile_send_state (
      id TEXT PRIMARY KEY,
      identity_pubkey TEXT NOT NULL,
      contact_pubkey TEXT NOT NULL,
      last_sent_profile_event_id TEXT,
      last_sent_profile_hash TEXT,
      last_attempt_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      UNIQUE(identity_pubkey, contact_pubkey)
    )
  `);

  db.run(`
    CREATE TABLE nostr_contacts (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      npub TEXT NOT NULL,
      alias TEXT,
      state TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_message_at TEXT,
      deleted_at TEXT
    )
  `);

  return db;
}

// ============================================================================
// Mock Relay Pool
// ============================================================================

class MockRelayPool {
  public publishResults: PublishResult[] = [];
  public shouldSucceed: boolean = true;
  public publishedEvents: NostrEvent[] = [];

  async connect(): Promise<void> {
    // Mock connect - do nothing
  }

  disconnect(): void {
    // Mock disconnect - do nothing
  }

  async publish(event: NostrEvent): Promise<PublishResult[]> {
    this.publishedEvents.push(event);

    if (this.shouldSucceed) {
      this.publishResults = [
        { relay: 'wss://relay1.example.com/', success: true, message: 'OK' },
        { relay: 'wss://relay2.example.com/', success: true, message: 'OK' }
      ];
    } else {
      this.publishResults = [
        { relay: 'wss://relay1.example.com/', success: false, message: 'Relay error' }
      ];
    }

    return this.publishResults;
  }

  resetMock(): void {
    this.publishResults = [];
    this.publishedEvents = [];
    this.shouldSucceed = true;
  }
}

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

const hexStringArb = (length: number): fc.Arbitrary<string> =>
  fc.string({
    minLength: length,
    maxLength: length,
    unit: fc.constantFrom(...'0123456789abcdef'.split(''))
  });

// Generate valid secp256k1 public keys by generating actual keypairs
const pubkeyHexArb = (): fc.Arbitrary<string> =>
  fc.constant(null).map(() => generateKeypair().keypair.pubkeyHex);

const hashArb = (): fc.Arbitrary<string> => hexStringArb(64);

const profileEventArb = (senderKeypair: NostrKeypair): fc.Arbitrary<NostrEvent> =>
  fc.record({
    name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    about: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
    picture: fc.option(fc.webUrl(), { nil: undefined })
  }).map((content) => {
    const eventTemplate = {
      kind: PRIVATE_PROFILE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(content)
    };
    return finalizeEvent(eventTemplate, senderKeypair.secretKey) as NostrEvent;
  });

// ============================================================================
// Property-Based Tests: sendProfileToContact
// ============================================================================

describe('sendProfileToContact - Property-Based Tests', () => {
  let db: Database;
  let mockPool: MockRelayPool;
  let senderKeypair: NostrKeypair;

  beforeEach(async () => {
    db = await createTestDatabase();
    mockPool = new MockRelayPool();
    const { keypair } = generateKeypair();
    senderKeypair = keypair;
  });

  it('property: idempotence - sending same profile hash twice skips second send', async () => {
    await fc.assert(
      fc.asyncProperty(
        profileEventArb(senderKeypair),
        hashArb(),
        pubkeyHexArb(),
        async (profileEvent, profileHash, recipientPubkey) => {
          const testDb = await createTestDatabase();
          const testPool = new MockRelayPool();

          // First send
          const result1 = await sendProfileToContact(
            profileEvent,
            profileHash,
            senderKeypair,
            recipientPubkey,
            testPool as any,
            testDb
          );

          // Second send with same hash
          const result2 = await sendProfileToContact(
            profileEvent,
            profileHash,
            senderKeypair,
            recipientPubkey,
            testPool as any,
            testDb
          );

          expect(result1.success).toBe(true);
          expect(result1.skipped).toBeUndefined();
          expect(result2.success).toBe(true);
          expect(result2.skipped).toBe(true);
          expect(testPool.publishedEvents.length).toBe(1); // Only one publish
        }
      ),
      { numRuns: 20 }
    );
  });

  it('property: NIP-59 wrapping - published event is wrapped, not raw profile', async () => {
    await fc.assert(
      fc.asyncProperty(
        profileEventArb(senderKeypair),
        hashArb(),
        pubkeyHexArb(),
        async (profileEvent, profileHash, recipientPubkey) => {
          const testDb = await createTestDatabase();
          const testPool = new MockRelayPool();

          await sendProfileToContact(
            profileEvent,
            profileHash,
            senderKeypair,
            recipientPubkey,
            testPool as any,
            testDb
          );

          expect(testPool.publishedEvents.length).toBe(1);
          const wrappedEvent = testPool.publishedEvents[0];

          // Wrapped event should NOT be PRIVATE_PROFILE_KIND
          expect(wrappedEvent.kind).not.toBe(PRIVATE_PROFILE_KIND);

          // Wrapped event should be kind 1059 (NIP-59 gift wrap)
          expect(wrappedEvent.kind).toBe(1059);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('property: send state persistence - successful send updates database', async () => {
    await fc.assert(
      fc.asyncProperty(
        profileEventArb(senderKeypair),
        hashArb(),
        pubkeyHexArb(),
        async (profileEvent, profileHash, recipientPubkey) => {
          const testDb = await createTestDatabase();
          const testPool = new MockRelayPool();

          const result = await sendProfileToContact(
            profileEvent,
            profileHash,
            senderKeypair,
            recipientPubkey,
            testPool as any,
            testDb
          );

          expect(result.success).toBe(true);

          const sendState = getSendState(senderKeypair.pubkeyHex, recipientPubkey, testDb);
          expect(sendState).not.toBeNull();
          expect(sendState!.lastSentProfileHash).toBe(profileHash);
          expect(sendState!.lastSentProfileEventId).toBe(result.eventId);
          expect(sendState!.lastSuccessAt).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('property: failure handling - relay failure updates error state', async () => {
    await fc.assert(
      fc.asyncProperty(
        profileEventArb(senderKeypair),
        hashArb(),
        pubkeyHexArb(),
        async (profileEvent, profileHash, recipientPubkey) => {
          const testDb = await createTestDatabase();
          const testPool = new MockRelayPool();
          testPool.shouldSucceed = false;

          const result = await sendProfileToContact(
            profileEvent,
            profileHash,
            senderKeypair,
            recipientPubkey,
            testPool as any,
            testDb
          );

          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();

          const sendState = getSendState(senderKeypair.pubkeyHex, recipientPubkey, testDb);
          expect(sendState).not.toBeNull();
          expect(sendState!.lastError).toBeDefined();
          expect(sendState!.lastAttemptAt).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('property: wrapping correctness - recipient can unwrap with their key', async () => {
    await fc.assert(
      fc.asyncProperty(
        profileEventArb(senderKeypair),
        hashArb(),
        async (profileEvent, profileHash) => {
          const { keypair: recipientKeypair } = generateKeypair();
          const testDb = await createTestDatabase();
          const testPool = new MockRelayPool();

          await sendProfileToContact(
            profileEvent,
            profileHash,
            senderKeypair,
            recipientKeypair.pubkeyHex,
            testPool as any,
            testDb
          );

          const wrappedEvent = testPool.publishedEvents[0];

          // Unwrap with recipient's private key
          const unwrapped = unwrapEvent(wrappedEvent, recipientKeypair.secretKey);

          // Unwrapped content should match original profile event
          expect(unwrapped.kind).toBe(PRIVATE_PROFILE_KIND);
          expect(unwrapped.content).toBe(profileEvent.content);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('property: profile hash changes trigger new send', async () => {
    await fc.assert(
      fc.asyncProperty(
        profileEventArb(senderKeypair),
        hashArb(),
        hashArb(),
        pubkeyHexArb(),
        async (profileEvent, hash1, hash2, recipientPubkey) => {
          fc.pre(hash1 !== hash2); // Hashes must be different

          const testDb = await createTestDatabase();
          const testPool = new MockRelayPool();

          const result1 = await sendProfileToContact(
            profileEvent,
            hash1,
            senderKeypair,
            recipientPubkey,
            testPool as any,
            testDb
          );

          const publishCount1 = testPool.publishedEvents.length;

          const result2 = await sendProfileToContact(
            profileEvent,
            hash2,
            senderKeypair,
            recipientPubkey,
            testPool as any,
            testDb
          );

          expect(result1.success).toBe(true);
          expect(result1.skipped).toBeUndefined();
          expect(result2.success).toBe(true);
          expect(result2.skipped).toBeUndefined();
          expect(testPool.publishedEvents.length).toBe(publishCount1 + 1); // Two publishes
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ============================================================================
// Property-Based Tests: sendProfileToAllContacts
// ============================================================================

describe('sendProfileToAllContacts - Property-Based Tests', () => {
  let db: Database;
  let mockPool: MockRelayPool;
  let senderKeypair: NostrKeypair;
  let identityId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    mockPool = new MockRelayPool();
    const { keypair } = generateKeypair();
    senderKeypair = keypair;
    identityId = randomUUID();

    // Clear database between tests
    db.run('DELETE FROM nostr_contacts');
    db.run('DELETE FROM nostr_profile_send_state');
  });

  it('property: completeness - all active contacts receive send attempt', async () => {
    await fc.assert(
      fc.asyncProperty(
        profileEventArb(senderKeypair),
        hashArb(),
        fc.array(fc.record({ npub: fc.constant('npub1test') }), { minLength: 1, maxLength: 5 }),
        async (profileEvent, profileHash, contactSpecs) => {
          // Create fresh database for this iteration
          const testDb = await createTestDatabase();
          const testIdentityId = randomUUID();

          // Insert contacts
          for (const spec of contactSpecs) {
            const { keypair: contactKeypair } = generateKeypair();
            testDb.run(
              'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state) VALUES (?, ?, ?, ?, ?)',
              [randomUUID(), testIdentityId, contactKeypair.npub, 'Test', 'connected']
            );
          }

          mockPool.resetMock();

          const results = await sendProfileToAllContacts(
            profileEvent,
            profileHash,
            senderKeypair,
            testIdentityId,
            mockPool as any,
            testDb
          );

          expect(results.length).toBe(contactSpecs.length);
          expect(results.every(r => r.contactId !== '')).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('property: independence - one contact failure does not block others', async () => {
    await fc.assert(
      fc.asyncProperty(
        profileEventArb(senderKeypair),
        hashArb(),
        async (profileEvent, profileHash) => {
          const testDb = await createTestDatabase();
          const testIdentityId = randomUUID();

          // Insert 3 contacts
          const contacts = [];
          for (let i = 0; i < 3; i++) {
            const { keypair: contactKeypair } = generateKeypair();
            const contactId = randomUUID();
            testDb.run(
              'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state) VALUES (?, ?, ?, ?, ?)',
              [contactId, testIdentityId, contactKeypair.npub, `Contact ${i}`, 'connected']
            );
            contacts.push({ id: contactId, keypair: contactKeypair });
          }

          mockPool.resetMock();

          const results = await sendProfileToAllContacts(
            profileEvent,
            profileHash,
            senderKeypair,
            testIdentityId,
            mockPool as any,
            testDb
          );

          expect(results.length).toBe(3);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('property: no contacts returns empty array', async () => {
    await fc.assert(
      fc.asyncProperty(
        profileEventArb(senderKeypair),
        hashArb(),
        async (profileEvent, profileHash) => {
          mockPool.resetMock();

          const results = await sendProfileToAllContacts(
            profileEvent,
            profileHash,
            senderKeypair,
            identityId,
            mockPool as any,
            db
          );

          expect(results).toEqual([]);
          expect(mockPool.publishedEvents.length).toBe(0);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('property: deleted contacts are excluded', async () => {
    await fc.assert(
      fc.asyncProperty(
        profileEventArb(senderKeypair),
        hashArb(),
        async (profileEvent, profileHash) => {
          const testDb = await createTestDatabase();
          const testIdentityId = randomUUID();
          const { keypair: contact1 } = generateKeypair();
          const { keypair: contact2 } = generateKeypair();

          // Insert active contact
          testDb.run(
            'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state) VALUES (?, ?, ?, ?, ?)',
            [randomUUID(), testIdentityId, contact1.npub, 'Active', 'connected']
          );

          // Insert deleted contact
          testDb.run(
            'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state, deleted_at) VALUES (?, ?, ?, ?, ?, ?)',
            [randomUUID(), testIdentityId, contact2.npub, 'Deleted', 'connected', new Date().toISOString()]
          );

          mockPool.resetMock();

          const results = await sendProfileToAllContacts(
            profileEvent,
            profileHash,
            senderKeypair,
            testIdentityId,
            mockPool as any,
            testDb
          );

          expect(results.length).toBe(1); // Only active contact
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ============================================================================
// Property-Based Tests: getSendState
// ============================================================================

describe('getSendState - Property-Based Tests', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  it('property: determinism - same inputs return same output', async () => {
    await fc.assert(
      fc.asyncProperty(
        pubkeyHexArb(),
        pubkeyHexArb(),
        hashArb(),
        async (identityPubkey, contactPubkey, profileHash) => {
          // Insert send state
          db.run(
            'INSERT INTO nostr_profile_send_state (id, identity_pubkey, contact_pubkey, last_sent_profile_hash) VALUES (?, ?, ?, ?)',
            [randomUUID(), identityPubkey, contactPubkey, profileHash]
          );

          const state1 = getSendState(identityPubkey, contactPubkey, db);
          const state2 = getSendState(identityPubkey, contactPubkey, db);

          expect(state1).toEqual(state2);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('property: existence check - returns null when no record exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        pubkeyHexArb(),
        pubkeyHexArb(),
        async (identityPubkey, contactPubkey) => {
          const state = getSendState(identityPubkey, contactPubkey, db);
          expect(state).toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('property: field mapping - returned state matches inserted data', async () => {
    await fc.assert(
      fc.asyncProperty(
        pubkeyHexArb(),
        pubkeyHexArb(),
        hashArb(),
        fc.string({ minLength: 1, maxLength: 64 }),
        async (identityPubkey, contactPubkey, profileHash, eventId) => {
          const now = new Date().toISOString();

          db.run(
            'INSERT INTO nostr_profile_send_state (id, identity_pubkey, contact_pubkey, last_sent_profile_event_id, last_sent_profile_hash, last_success_at) VALUES (?, ?, ?, ?, ?, ?)',
            [randomUUID(), identityPubkey, contactPubkey, eventId, profileHash, now]
          );

          const state = getSendState(identityPubkey, contactPubkey, db);

          expect(state).not.toBeNull();
          expect(state!.identityPubkey).toBe(identityPubkey);
          expect(state!.contactPubkey).toBe(contactPubkey);
          expect(state!.lastSentProfileHash).toBe(profileHash);
          expect(state!.lastSentProfileEventId).toBe(eventId);
          expect(state!.lastSuccessAt).toBe(now);
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ============================================================================
// Example-Based Tests (Edge Cases)
// ============================================================================

describe('sendProfileToContact - Example Tests', () => {
  let db: Database;
  let mockPool: MockRelayPool;
  let senderKeypair: NostrKeypair;

  beforeEach(async () => {
    db = await createTestDatabase();
    mockPool = new MockRelayPool();
    const { keypair } = generateKeypair();
    senderKeypair = keypair;
  });

  it('example: simple send succeeds', async () => {
    const profileEvent = await fc.sample(profileEventArb(senderKeypair), 1)[0];
    const profileHash = await fc.sample(hashArb(), 1)[0];
    const recipientPubkey = await fc.sample(pubkeyHexArb(), 1)[0];

    const result = await sendProfileToContact(
      profileEvent,
      profileHash,
      senderKeypair,
      recipientPubkey,
      mockPool as any,
      db
    );

    expect(result.success).toBe(true);
    expect(result.contactPubkey).toBe(recipientPubkey);
    expect(mockPool.publishedEvents.length).toBe(1);
  });

  it('example: empty relay pool results still handled gracefully', async () => {
    const profileEvent = await fc.sample(profileEventArb(senderKeypair), 1)[0];
    const profileHash = await fc.sample(hashArb(), 1)[0];
    const recipientPubkey = await fc.sample(pubkeyHexArb(), 1)[0];

    // Mock empty publish results
    mockPool.publish = async () => [];

    const result = await sendProfileToContact(
      profileEvent,
      profileHash,
      senderKeypair,
      recipientPubkey,
      mockPool as any,
      db
    );

    expect(result.success).toBe(false);
  });
});
