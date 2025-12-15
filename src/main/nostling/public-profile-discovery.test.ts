import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import * as fc from 'fast-check';
import initSqlJs, { Database } from 'sql.js';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp')
  }
}));
import {
  discoverPublicProfile,
  discoverPublicProfilesForIdentityAndContacts,
  schedulePublicProfileDiscovery,
  getPublicProfilePresence
} from './public-profile-discovery';
import { RelayPool } from './relay-pool';
import { NostrEvent } from './crypto';
import { ProfileContent } from '../../shared/profile-types';

const hexChar = (): fc.Arbitrary<string> => fc.integer({ min: 0, max: 15 }).map(n => n.toString(16));
const hexString = (length: number): fc.Arbitrary<string> =>
  fc.array(hexChar(), { minLength: length, maxLength: length }).map(arr => arr.join(''));

const pubkeyArb: fc.Arbitrary<string> = hexString(64);
const eventIdArb: fc.Arbitrary<string> = hexString(64);

const profileContentArb: fc.Arbitrary<ProfileContent> = fc.record({
  name: fc.option(fc.string(), { nil: undefined }),
  display_name: fc.option(fc.string(), { nil: undefined }),
  about: fc.option(fc.string(), { nil: undefined }),
  picture: fc.option(fc.webUrl(), { nil: undefined }),
  banner: fc.option(fc.webUrl(), { nil: undefined }),
  website: fc.option(fc.webUrl(), { nil: undefined }),
  nip05: fc.option(fc.emailAddress(), { nil: undefined }),
  lud16: fc.option(fc.emailAddress(), { nil: undefined }),
  lud06: fc.option(fc.string(), { nil: undefined })
}, { requiredKeys: [] });

const createNostrEvent = (pubkey: string, content: ProfileContent, eventId: string, sig: string): NostrEvent => ({
  id: eventId,
  pubkey,
  created_at: 1000000000,
  kind: 0,
  tags: [],
  content: JSON.stringify(content),
  sig
});

type MockRelayPool = {
  querySync: jest.Mock;
};

const createMockPool = (events: NostrEvent[]): MockRelayPool => {
  const mock = jest.fn();
  // @ts-ignore - Jest typing issue
  mock.mockResolvedValue(events);
  return { querySync: mock };
};

const createFailingMockPool = (error: Error): MockRelayPool => {
  const mock = jest.fn();
  // @ts-ignore - Jest typing issue
  mock.mockRejectedValue(error);
  return { querySync: mock };
};

describe('Public Profile Discovery', () => {
  let database: Database;
  let SQL: any;

  beforeEach(async () => {
    SQL = await initSqlJs();
    database = new SQL.Database();

    database.run(`
      CREATE TABLE nostr_identities (
        id TEXT PRIMARY KEY,
        npub TEXT NOT NULL,
        secret_ref TEXT NOT NULL,
        label TEXT NOT NULL,
        relays TEXT,
        theme TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    database.run(`
      CREATE TABLE nostr_contacts (
        id TEXT PRIMARY KEY,
        identity_id TEXT NOT NULL,
        npub TEXT NOT NULL,
        alias TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_message_at TEXT,
        deleted_at TEXT
      )
    `);

    database.run(`
      CREATE TABLE nostr_profiles (
        id TEXT PRIMARY KEY,
        owner_pubkey TEXT NOT NULL,
        source TEXT NOT NULL,
        content_json TEXT NOT NULL,
        event_id TEXT,
        valid_signature INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    database.run(`
      CREATE TABLE nostr_public_profile_presence (
        id TEXT PRIMARY KEY,
        pubkey TEXT NOT NULL UNIQUE,
        has_public_profile INTEGER NOT NULL DEFAULT 0,
        last_checked_at TEXT,
        last_check_success INTEGER NOT NULL DEFAULT 0,
        last_seen_event_id TEXT
      )
    `);
  });

  describe('discoverPublicProfile', () => {
    it('updates last_checked_at timestamp after every query', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, async (pubkey) => {
          const mockPool = createMockPool([]) as unknown as RelayPool;

          const before = new Date();
          await discoverPublicProfile(pubkey, mockPool, database);
          const after = new Date();

          const presence = getPublicProfilePresence(pubkey, database);
          expect(presence).not.toBeNull();
          expect(presence!.lastCheckedAt).toBeDefined();

          const checkedTime = new Date(presence!.lastCheckedAt!);
          expect(checkedTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
          expect(checkedTime.getTime()).toBeLessThanOrEqual(after.getTime());
        }),
        { numRuns: 5 }
      );
    });

    it('sets exists=true only when kind:0 found and relay succeeded', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, profileContentArb, eventIdArb, hexString(128), async (pubkey, content, eventId, sig) => {
          const event = createNostrEvent(pubkey, content, eventId, sig);
          const mockPool = createMockPool([event]) as unknown as RelayPool;

          const presence = await discoverPublicProfile(pubkey, mockPool, database);

          expect(presence.exists).toBe(true);
          expect(presence.lastCheckSuccess).toBe(true);
          expect(presence.lastSeenEventId).toBe(event.id);
        }),
        { numRuns: 5 }
      );
    });

    it('sets exists=false when relay succeeds but no kind:0 found', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, async (pubkey) => {
          const mockPool = createMockPool([]) as unknown as RelayPool;

          const presence = await discoverPublicProfile(pubkey, mockPool, database);

          expect(presence.exists).toBe(false);
          expect(presence.lastCheckSuccess).toBe(true);
          expect(presence.lastSeenEventId).toBeUndefined();
        }),
        { numRuns: 5 }
      );
    });

    it('sets last_check_success=false on relay error', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, fc.string(), async (pubkey, errorMsg) => {
          const mockPool = createFailingMockPool(new Error(errorMsg)) as unknown as RelayPool;

          const presence = await discoverPublicProfile(pubkey, mockPool, database);

          expect(presence.lastCheckSuccess).toBe(false);
          expect(presence.exists).toBe(false);
        }),
        { numRuns: 5 }
      );
    });

    it('stores profile content when kind:0 event found', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, profileContentArb, eventIdArb, hexString(128), async (pubkey, content, eventId, sig) => {
          const event = createNostrEvent(pubkey, content, eventId, sig);
          const mockPool = createMockPool([event]) as unknown as RelayPool;

          await discoverPublicProfile(pubkey, mockPool, database);

          const stmt = database.prepare(
            'SELECT * FROM nostr_profiles WHERE owner_pubkey = ? AND source = ?'
          );
          stmt.bind([pubkey, 'public_discovered']);
          const hasProfile = stmt.step();
          expect(hasProfile).toBe(true);

          const row = stmt.getAsObject();
          const storedContent = JSON.parse(row.content_json as string);
          expect(storedContent).toEqual(content);
          expect(row.event_id).toBe(event.id);
          stmt.free();
        }),
        { numRuns: 5 }
      );
    });

    it('handles malformed JSON gracefully by setting exists=false', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, fc.string(), eventIdArb, hexString(128), async (pubkey, malformedContent, eventId, sig) => {
          fc.pre(!isValidJSON(malformedContent));

          const event: NostrEvent = {
            id: eventId,
            pubkey,
            created_at: 1000000000,
            kind: 0,
            tags: [],
            content: malformedContent,
            sig
          };

          const mockPool = createMockPool([event]) as unknown as RelayPool;

          const presence = await discoverPublicProfile(pubkey, mockPool, database);

          expect(presence.exists).toBe(false);
          expect(presence.lastSeenEventId).toBeUndefined();
        }),
        { numRuns: 5 }
      );
    });

    it('creates relay filter with correct structure', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, async (pubkey) => {
          const mockPool = createMockPool([]);

          await discoverPublicProfile(pubkey, mockPool as unknown as RelayPool, database);

          expect(mockPool.querySync).toHaveBeenCalledWith(
            [{ kinds: [0], authors: [pubkey], limit: 1 }],
            { maxWait: 5000 }
          );
        }),
        { numRuns: 5 }
      );
    });

    it('preserves presence ID across multiple checks', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, async (pubkey) => {
          const mockPool = createMockPool([]) as unknown as RelayPool;

          const first = await discoverPublicProfile(pubkey, mockPool, database);
          const second = await discoverPublicProfile(pubkey, mockPool, database);

          expect(first.id).toBe(second.id);
        }),
        { numRuns: 5 }
      );
    });
  });

  describe('getPublicProfilePresence', () => {
    it('returns null for never-checked pubkey', () => {
      fc.assert(
        fc.property(pubkeyArb, (pubkey) => {
          const presence = getPublicProfilePresence(pubkey, database);
          expect(presence).toBeNull();
        }),
        { numRuns: 5 }
      );
    });

    it('returns valid presence after discovery', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, async (pubkey) => {
          const mockPool = createMockPool([]) as unknown as RelayPool;

          const discovered = await discoverPublicProfile(pubkey, mockPool, database);
          const retrieved = getPublicProfilePresence(pubkey, database);

          expect(retrieved).not.toBeNull();
          expect(retrieved!.id).toBe(discovered.id);
          expect(retrieved!.pubkey).toBe(discovered.pubkey);
          expect(retrieved!.exists).toBe(discovered.exists);
          expect(retrieved!.lastCheckSuccess).toBe(discovered.lastCheckSuccess);
        }),
        { numRuns: 5 }
      );
    });

    it('reflects most recent discovery state', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, profileContentArb, eventIdArb, hexString(128), async (pubkey, content, eventId, sig) => {
          const event = createNostrEvent(pubkey, content, eventId, sig);

          const emptyPool = createMockPool([]) as unknown as RelayPool;
          const fullPool = createMockPool([event]) as unknown as RelayPool;

          await discoverPublicProfile(pubkey, emptyPool, database);
          const afterEmpty = getPublicProfilePresence(pubkey, database);
          expect(afterEmpty!.exists).toBe(false);

          await discoverPublicProfile(pubkey, fullPool, database);
          const afterFull = getPublicProfilePresence(pubkey, database);
          expect(afterFull!.exists).toBe(true);
          expect(afterFull!.lastSeenEventId).toBe(event.id);
        }),
        { numRuns: 5 }
      );
    });
  });

  describe('discoverPublicProfilesForIdentityAndContacts', () => {
    it('throws error when identity not found', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (identityId) => {
          const mockPool = {} as RelayPool;

          await expect(
            discoverPublicProfilesForIdentityAndContacts(identityId, mockPool, database)
          ).rejects.toThrow('Identity not found');
        }),
        { numRuns: 5 }
      );
    });

    it('returns only identity result when no contacts', async () => {
      // Valid npub for all-zeros pubkey
      const validNpub = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme';
      const identityId = 'identity-1';

      database.run(
        'INSERT INTO nostr_identities (id, npub, secret_ref, label) VALUES (?, ?, ?, ?)',
        [identityId, validNpub, 'ref', 'test']
      );

      const mockPool = createMockPool([]) as unknown as RelayPool;

      const results = await discoverPublicProfilesForIdentityAndContacts(identityId, mockPool, database);

      expect(results).toHaveLength(1);
    });

    it('first result is identity, subsequent are contacts', async () => {
      // Valid npubs with correct checksums
      const identityNpub = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme';
      const contact1Npub = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqshp52w2';
      const contact2Npub = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqdangsl';

      const identityId = 'identity-1';
      database.run(
        'INSERT INTO nostr_identities (id, npub, secret_ref, label) VALUES (?, ?, ?, ?)',
        [identityId, identityNpub, 'ref', 'test']
      );

      database.run(
        'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state) VALUES (?, ?, ?, ?, ?)',
        ['c1', identityId, contact1Npub, 'Contact 1', 'active']
      );

      database.run(
        'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state) VALUES (?, ?, ?, ?, ?)',
        ['c2', identityId, contact2Npub, 'Contact 2', 'active']
      );

      const mockPool = createMockPool([]) as unknown as RelayPool;

      const results = await discoverPublicProfilesForIdentityAndContacts(identityId, mockPool, database);

      expect(results).toHaveLength(3);
      expect(results[0].pubkey).toBe('0000000000000000000000000000000000000000000000000000000000000000');
    });

    it('skips deleted contacts', async () => {
      const identityNpub = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme';
      const contactNpub = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqshp52w2';

      const identityId = 'identity-1';
      database.run(
        'INSERT INTO nostr_identities (id, npub, secret_ref, label) VALUES (?, ?, ?, ?)',
        [identityId, identityNpub, 'ref', 'test']
      );

      database.run(
        'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state, deleted_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['c1', identityId, contactNpub, 'Deleted', 'active', new Date().toISOString()]
      );

      const mockPool = createMockPool([]) as unknown as RelayPool;

      const results = await discoverPublicProfilesForIdentityAndContacts(identityId, mockPool, database);

      expect(results).toHaveLength(1);
    });

    it('continues on individual pubkey failure', async () => {
      const identityNpub = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme';
      const contact1Npub = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqshp52w2';

      const identityId = 'identity-1';
      database.run(
        'INSERT INTO nostr_identities (id, npub, secret_ref, label) VALUES (?, ?, ?, ?)',
        [identityId, identityNpub, 'ref', 'test']
      );

      database.run(
        'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state) VALUES (?, ?, ?, ?, ?)',
        ['c1', identityId, contact1Npub, 'Contact 1', 'active']
      );

      let callCount = 0;
      const mockPool = {
        querySync: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('Relay error'));
          }
          return Promise.resolve([]);
        })
      } as unknown as RelayPool;

      const results = await discoverPublicProfilesForIdentityAndContacts(identityId, mockPool, database);

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('schedulePublicProfileDiscovery', () => {
    it('runs discovery immediately', async () => {
      const identityNpub = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme';
      const identityId = 'identity-1';
      database.run(
        'INSERT INTO nostr_identities (id, npub, secret_ref, label) VALUES (?, ?, ?, ?)',
        [identityId, identityNpub, 'ref', 'test']
      );

      const mockPool = createMockPool([]);

      const cleanup = schedulePublicProfileDiscovery(identityId, mockPool as unknown as RelayPool, database);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockPool.querySync).toHaveBeenCalled();

      cleanup();
    });

    it('cleanup function stops scheduling', async () => {
      const identityNpub = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme';
      const identityId = 'identity-1';
      database.run(
        'INSERT INTO nostr_identities (id, npub, secret_ref, label) VALUES (?, ?, ?, ?)',
        [identityId, identityNpub, 'ref', 'test']
      );

      const mockPool = createMockPool([]);

      const cleanup = schedulePublicProfileDiscovery(identityId, mockPool as unknown as RelayPool, database);
      cleanup();

      const callCountBefore = mockPool.querySync.mock.calls.length;

      await new Promise(resolve => setTimeout(resolve, 200));

      const callCountAfter = mockPool.querySync.mock.calls.length;

      expect(callCountAfter).toBeLessThanOrEqual(callCountBefore + 1);
    });

    it('handles discovery errors without crashing', async () => {
      const identityNpub = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme';
      const identityId = 'identity-1';
      database.run(
        'INSERT INTO nostr_identities (id, npub, secret_ref, label) VALUES (?, ?, ?, ?)',
        [identityId, identityNpub, 'ref', 'test']
      );

      const mockPool = createFailingMockPool(new Error('Relay failure'));

      const cleanup = schedulePublicProfileDiscovery(identityId, mockPool as unknown as RelayPool, database);

      await new Promise(resolve => setTimeout(resolve, 100));

      cleanup();
    });
  });

  describe('Property: Conservative presence indicator logic', () => {
    it('show indicator only when exists=true AND last_check_success=true', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, profileContentArb, eventIdArb, hexString(128), async (pubkey, content, eventId, sig) => {
          const event = createNostrEvent(pubkey, content, eventId, sig);
          const mockPool = createMockPool([event]) as unknown as RelayPool;

          const presence = await discoverPublicProfile(pubkey, mockPool, database);

          const shouldShowIndicator = presence.exists && presence.lastCheckSuccess;
          expect(shouldShowIndicator).toBe(true);
        }),
        { numRuns: 5 }
      );
    });

    it('hide indicator when last_check_success=false', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, async (pubkey) => {
          const mockPool = createFailingMockPool(new Error('Network error')) as unknown as RelayPool;

          const presence = await discoverPublicProfile(pubkey, mockPool, database);

          const shouldShowIndicator = presence.exists && presence.lastCheckSuccess;
          expect(shouldShowIndicator).toBe(false);
        }),
        { numRuns: 5 }
      );
    });
  });

  describe('Property: Idempotence', () => {
    it('multiple discoveries of same pubkey are idempotent', async () => {
      await fc.assert(
        fc.asyncProperty(pubkeyArb, profileContentArb, eventIdArb, hexString(128), async (pubkey, content, eventId, sig) => {
          const event = createNostrEvent(pubkey, content, eventId, sig);
          const mockPool = createMockPool([event]) as unknown as RelayPool;

          const first = await discoverPublicProfile(pubkey, mockPool, database);
          const second = await discoverPublicProfile(pubkey, mockPool, database);

          expect(first.id).toBe(second.id);
          expect(first.pubkey).toBe(second.pubkey);
          expect(first.exists).toBe(second.exists);
        }),
        { numRuns: 5 }
      );
    });
  });
});

function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
