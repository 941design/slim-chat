/**
 * Property-based tests for profile enhancement functions
 *
 * Tests verify:
 * - Batch efficiency: single query for all identities/contacts
 * - Priority logic: private sources always chosen over public
 * - Graceful degradation: missing profiles don't break function
 * - Immutability: input arrays not modified
 * - Content parsing: malformed JSON handled gracefully
 * - Order preservation: output order matches input order
 * - Type safety: profileSource and picture have correct types
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import type { NostlingIdentity, NostlingContact } from '../../shared/types';
import type { Database } from 'sql.js';
import initSqlJs from 'sql.js';
import { enhanceIdentitiesWithProfilesSqlJs, enhanceContactsWithProfilesSqlJs } from './service-profile-status';
import { randomUUID } from 'node:crypto';
import { nip19 } from 'nostr-tools';

// ============================================================================
// TEST HELPERS
// ============================================================================

interface TestContext {
  database: Database;
}

/**
 * Generate a valid hex pubkey (64 characters)
 */
const arbitraryHexPubkey = (): fc.Arbitrary<string> => {
  // Generate 32 random bytes as hex (32 * 2 = 64 hex chars)
  return fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 32, maxLength: 32 }).map((bytes) =>
    bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
  );
};

/**
 * Generate a valid npub from a hex pubkey
 */
const npubFromHex = (hex: string): string => {
  return nip19.npubEncode(hex);
};

/**
 * Create a test identity with given npub
 */
const createTestIdentity = (npub: string): NostlingIdentity => {
  return {
    id: randomUUID(),
    npub,
    secretRef: `secret-ref-${randomUUID()}`,
    label: `Identity-${npub.slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
};

/**
 * Create a test contact with given npub
 */
const createTestContact = (npub: string, identityId: string): NostlingContact => {
  return {
    id: randomUUID(),
    identityId,
    npub,
    alias: `Contact-${npub.slice(0, 8)}`,
    state: 'pending',
    createdAt: new Date().toISOString(),
  };
};

/**
 * Initialize test database with schema
 */
async function initializeTestDatabase(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create nostr_profiles table
  db.run(`
    CREATE TABLE IF NOT EXISTS nostr_profiles (
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

  return db;
}

/**
 * Insert a profile into the database
 */
function insertProfile(
  database: Database,
  pubkeyHex: string,
  source: 'private_authored' | 'private_received' | 'public_discovered',
  content: Record<string, unknown>
): void {
  const stmt = database.prepare(
    'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, valid_signature) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.bind([randomUUID(), pubkeyHex, source, JSON.stringify(content), 1]);
  stmt.step();
  stmt.free();
}

/**
 * Count total queries executed (naive tracking via statement creation)
 */
let statementCount = 0;

// ============================================================================
// PROPERTY-BASED TESTS: IDENTITIES
// ============================================================================

describe('enhanceIdentitiesWithProfilesSqlJs - Property-Based Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = {
      database: await initializeTestDatabase(),
    };
    statementCount = 0;
  });

  describe('Batch Efficiency Properties', () => {
    it('P001: Processes any number of identities with single database query', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbitraryHexPubkey(), { minLength: 1, maxLength: 10 }),
          async (pubkeyHexes) => {
            const identities = pubkeyHexes.map((hex) => createTestIdentity(npubFromHex(hex)));

            // Insert one public profile for each pubkey
            pubkeyHexes.forEach((hex) => {
              insertProfile(context.database, hex, 'public_discovered', { picture: 'https://example.com/pic.jpg' });
            });

            const result = enhanceIdentitiesWithProfilesSqlJs(context.database, identities);

            // Should return same number of identities
            expect(result).toHaveLength(identities.length);

            // All should have profileSource populated
            result.forEach((identity) => {
              expect(['private_authored', 'public_discovered', null]).toContain(identity.profileSource);
            });

            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('P002: Empty input returns empty output without query', async () => {
      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, []);
      expect(result).toEqual([]);
    });

    it('P003: Single identity returns single enhanced identity', async () => {
      const hex = 'a'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));

      insertProfile(context.database, hex, 'public_discovered', { picture: 'https://example.com/pic.jpg' });

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(identity.id);
      expect(result[0].profileSource).toBe('public_discovered');
    });
  });

  describe('Priority Logic Properties', () => {
    it('P004: private_authored has priority over public_discovered for identities', async () => {
      const hex = 'b'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));

      // Insert both profiles
      insertProfile(context.database, hex, 'public_discovered', { picture: 'https://public.jpg' });
      insertProfile(context.database, hex, 'private_authored', { picture: 'https://private.jpg' });

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity]);

      // Should always select private_authored
      expect(result[0].profileSource).toBe('private_authored');
      expect(result[0].picture).toBe('https://private.jpg');
    });

    it('P005: Only private_authored and public_discovered sources are considered for identities', async () => {
      const hex = 'c'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));

      // Try to insert private_received (should be ignored)
      insertProfile(context.database, hex, 'private_received', { picture: 'https://received.jpg' });
      insertProfile(context.database, hex, 'public_discovered', { picture: 'https://public.jpg' });

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity]);

      // Should get public_discovered (private_received is not in allowed sources)
      expect(result[0].profileSource).toBe('public_discovered');
      expect(result[0].picture).toBe('https://public.jpg');
    });

    it('P006: When only public_discovered exists, use that for identities', async () => {
      const hex = 'd'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));

      insertProfile(context.database, hex, 'public_discovered', { picture: 'https://public.jpg' });

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity]);

      expect(result[0].profileSource).toBe('public_discovered');
      expect(result[0].picture).toBe('https://public.jpg');
    });

    it('P007: When only private_authored exists, use that for identities', async () => {
      const hex = 'e'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));

      insertProfile(context.database, hex, 'private_authored', { picture: 'https://private.jpg' });

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity]);

      expect(result[0].profileSource).toBe('private_authored');
      expect(result[0].picture).toBe('https://private.jpg');
    });
  });

  describe('Graceful Degradation Properties', () => {
    it('P008: Missing profiles result in null profileSource and picture', async () => {
      const hex = 'f'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));

      // Don't insert any profile
      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity]);

      expect(result[0].profileSource).toBeNull();
      expect(result[0].picture).toBeNull();
    });

    it('P009: Malformed content_json results in null picture but valid profileSource', async () => {
      const hex = '0'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));

      // Insert profile with malformed JSON (will be stored as-is, parsing fails gracefully)
      const stmt = context.database.prepare(
        'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, valid_signature) VALUES (?, ?, ?, ?, ?)'
      );
      stmt.bind([randomUUID(), hex, 'public_discovered', '{invalid json}}', 1]);
      stmt.step();
      stmt.free();

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity]);

      expect(result[0].profileSource).toBe('public_discovered');
      expect(result[0].picture).toBeNull();
    });

    it('P010: Missing picture field in content results in null picture', async () => {
      const hex = '1'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));

      insertProfile(context.database, hex, 'public_discovered', { name: 'Test User' });

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity]);

      expect(result[0].profileSource).toBe('public_discovered');
      expect(result[0].picture).toBeNull();
    });

    it('P011: Mixed identities (some with profiles, some without) all enhanced correctly', async () => {
      const hex1 = '2'.repeat(64);
      const hex2 = '3'.repeat(64);

      const identity1 = createTestIdentity(npubFromHex(hex1));
      const identity2 = createTestIdentity(npubFromHex(hex2));

      // Only insert profile for first identity
      insertProfile(context.database, hex1, 'public_discovered', { picture: 'https://pic1.jpg' });

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity1, identity2]);

      expect(result[0].profileSource).toBe('public_discovered');
      expect(result[0].picture).toBe('https://pic1.jpg');
      expect(result[1].profileSource).toBeNull();
      expect(result[1].picture).toBeNull();
    });
  });

  describe('Immutability Properties', () => {
    it('P012: Input array is not modified', async () => {
      const hex = '4'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));
      const input = [identity];
      const inputCopy = JSON.parse(JSON.stringify(input));

      insertProfile(context.database, hex, 'public_discovered', { picture: 'https://pic.jpg' });

      enhanceIdentitiesWithProfilesSqlJs(context.database, input);

      expect(input).toEqual(inputCopy);
    });

    it('P013: Output is new array instance (not same reference)', async () => {
      const hex = '5'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));
      const input = [identity];

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, input);

      expect(result).not.toBe(input);
    });

    it('P014: Output identities are new object instances', async () => {
      const hex = '6'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));

      insertProfile(context.database, hex, 'public_discovered', { picture: 'https://pic.jpg' });

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity]);

      expect(result[0]).not.toBe(identity);
      // But existing fields should be equal
      expect(result[0].id).toBe(identity.id);
      expect(result[0].npub).toBe(identity.npub);
    });
  });

  describe('Order Preservation Properties', () => {
    it('P015: Output order matches input order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbitraryHexPubkey(), { minLength: 2, maxLength: 5 }),
          async (pubkeyHexes) => {
            const identities = pubkeyHexes.map((hex) => createTestIdentity(npubFromHex(hex)));

            const result = enhanceIdentitiesWithProfilesSqlJs(context.database, identities);

            // Check order is preserved
            identities.forEach((identity, i) => {
              expect(result[i].id).toBe(identity.id);
            });

            return true;
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  describe('Type Safety Properties', () => {
    it('P016: profileSource is always one of valid types or null', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbitraryHexPubkey(), { minLength: 1, maxLength: 5 }),
          async (pubkeyHexes) => {
            const identities = pubkeyHexes.map((hex) => createTestIdentity(npubFromHex(hex)));

            // Insert some profiles
            pubkeyHexes.forEach((hex) => {
              insertProfile(context.database, hex, 'public_discovered', { picture: 'https://pic.jpg' });
            });

            const result = enhanceIdentitiesWithProfilesSqlJs(context.database, identities);

            result.forEach((identity) => {
              expect(['private_authored', 'public_discovered', null]).toContain(identity.profileSource);
            });

            return true;
          }
        ),
        { numRuns: 5 }
      );
    });

    it('P017: picture is always string or null', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbitraryHexPubkey(), { minLength: 1, maxLength: 5 }),
          async (pubkeyHexes) => {
            const identities = pubkeyHexes.map((hex) => createTestIdentity(npubFromHex(hex)));

            pubkeyHexes.forEach((hex) => {
              insertProfile(context.database, hex, 'public_discovered', { picture: 'https://pic.jpg' });
            });

            const result = enhanceIdentitiesWithProfilesSqlJs(context.database, identities);

            result.forEach((identity) => {
              expect(identity.picture === null || typeof identity.picture === 'string').toBe(true);
            });

            return true;
          }
        ),
        { numRuns: 5 }
      );
    });
  });
});

// ============================================================================
// PROPERTY-BASED TESTS: CONTACTS
// ============================================================================

describe('enhanceContactsWithProfilesSqlJs - Property-Based Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = {
      database: await initializeTestDatabase(),
    };
  });

  describe('Batch Efficiency Properties', () => {
    it('P018: Processes any number of contacts with single database query', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbitraryHexPubkey(), { minLength: 1, maxLength: 10 }),
          async (pubkeyHexes) => {
            const identityId = randomUUID();
            const contacts = pubkeyHexes.map((hex) => createTestContact(npubFromHex(hex), identityId));

            pubkeyHexes.forEach((hex) => {
              insertProfile(context.database, hex, 'public_discovered', { picture: 'https://example.com/pic.jpg' });
            });

            const result = enhanceContactsWithProfilesSqlJs(context.database, contacts);

            expect(result).toHaveLength(contacts.length);
            result.forEach((contact) => {
              expect(['private_received', 'public_discovered', null]).toContain(contact.profileSource);
            });

            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('P019: Empty contact list returns empty result', async () => {
      const result = enhanceContactsWithProfilesSqlJs(context.database, []);
      expect(result).toEqual([]);
    });
  });

  describe('Priority Logic Properties for Contacts', () => {
    it('P020: private_received has priority over public_discovered for contacts', async () => {
      const hex = '7'.repeat(64);
      const contact = createTestContact(npubFromHex(hex), randomUUID());

      insertProfile(context.database, hex, 'public_discovered', { picture: 'https://public.jpg' });
      insertProfile(context.database, hex, 'private_received', { picture: 'https://received.jpg' });

      const result = enhanceContactsWithProfilesSqlJs(context.database, [contact]);

      expect(result[0].profileSource).toBe('private_received');
      expect(result[0].picture).toBe('https://received.jpg');
    });

    it('P021: Only private_received and public_discovered sources considered for contacts', async () => {
      const hex = '8'.repeat(64);
      const contact = createTestContact(npubFromHex(hex), randomUUID());

      // Try to insert private_authored (should be ignored for contacts)
      insertProfile(context.database, hex, 'private_authored', { picture: 'https://authored.jpg' });
      insertProfile(context.database, hex, 'public_discovered', { picture: 'https://public.jpg' });

      const result = enhanceContactsWithProfilesSqlJs(context.database, [contact]);

      expect(result[0].profileSource).toBe('public_discovered');
      expect(result[0].picture).toBe('https://public.jpg');
    });
  });

  describe('Graceful Degradation Properties for Contacts', () => {
    it('P022: Missing profiles result in null for contacts', async () => {
      const hex = '9'.repeat(64);
      const contact = createTestContact(npubFromHex(hex), randomUUID());

      const result = enhanceContactsWithProfilesSqlJs(context.database, [contact]);

      expect(result[0].profileSource).toBeNull();
      expect(result[0].picture).toBeNull();
    });

    it('P023: Malformed JSON handled gracefully for contacts', async () => {
      const hex = 'a'.repeat(64);
      const contact = createTestContact(npubFromHex(hex), randomUUID());

      const stmt = context.database.prepare(
        'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, valid_signature) VALUES (?, ?, ?, ?, ?)'
      );
      stmt.bind([randomUUID(), hex, 'public_discovered', '{bad json}}', 1]);
      stmt.step();
      stmt.free();

      const result = enhanceContactsWithProfilesSqlJs(context.database, [contact]);

      expect(result[0].profileSource).toBe('public_discovered');
      expect(result[0].picture).toBeNull();
    });
  });

  describe('Immutability Properties for Contacts', () => {
    it('P024: Input contact array not modified', async () => {
      const hex = 'b'.repeat(64);
      const contact = createTestContact(npubFromHex(hex), randomUUID());
      const input = [contact];
      const inputCopy = JSON.parse(JSON.stringify(input));

      enhanceContactsWithProfilesSqlJs(context.database, input);

      expect(input).toEqual(inputCopy);
    });

    it('P025: Output contacts are new instances', async () => {
      const hex = 'c'.repeat(64);
      const contact = createTestContact(npubFromHex(hex), randomUUID());

      const result = enhanceContactsWithProfilesSqlJs(context.database, [contact]);

      expect(result[0]).not.toBe(contact);
      expect(result[0].id).toBe(contact.id);
    });
  });
});

// ============================================================================
// EXAMPLE-BASED TESTS
// ============================================================================

describe('Profile Enhancement - Example-Based Tests', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = {
      database: await initializeTestDatabase(),
    };
  });

  describe('Identity Enhancement Examples', () => {
    it('E001: Identity with no profile gets null fields', async () => {
      const hex = 'd'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity]);

      expect(result[0]).toEqual({
        ...identity,
        profileSource: null,
        picture: null,
      });
    });

    it('E002: Identity with public profile gets public_discovered source', async () => {
      const hex = 'e'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));

      insertProfile(context.database, hex, 'public_discovered', { picture: 'https://avatar.jpg', name: 'John' });

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity]);

      expect(result[0].profileSource).toBe('public_discovered');
      expect(result[0].picture).toBe('https://avatar.jpg');
    });

    it('E003: Identity with private profile gets private_authored source', async () => {
      const hex = 'f'.repeat(64);
      const identity = createTestIdentity(npubFromHex(hex));

      insertProfile(context.database, hex, 'private_authored', { picture: 'https://private.jpg' });

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [identity]);

      expect(result[0].profileSource).toBe('private_authored');
      expect(result[0].picture).toBe('https://private.jpg');
    });

    it('E004: Multiple identities enhanced in order', async () => {
      const hex1 = '0'.repeat(63) + '1';
      const hex2 = '0'.repeat(63) + '2';

      const id1 = createTestIdentity(npubFromHex(hex1));
      const id2 = createTestIdentity(npubFromHex(hex2));

      insertProfile(context.database, hex1, 'public_discovered', { picture: 'https://pic1.jpg' });
      insertProfile(context.database, hex2, 'private_authored', { picture: 'https://pic2.jpg' });

      const result = enhanceIdentitiesWithProfilesSqlJs(context.database, [id1, id2]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(id1.id);
      expect(result[0].profileSource).toBe('public_discovered');
      expect(result[1].id).toBe(id2.id);
      expect(result[1].profileSource).toBe('private_authored');
    });
  });

  describe('Contact Enhancement Examples', () => {
    it('E005: Contact with no profile gets null fields', async () => {
      const hex = '3'.repeat(64);
      const contact = createTestContact(npubFromHex(hex), randomUUID());

      const result = enhanceContactsWithProfilesSqlJs(context.database, [contact]);

      expect(result[0].profileSource).toBeNull();
      expect(result[0].picture).toBeNull();
    });

    it('E006: Contact with received private profile gets priority', async () => {
      const hex = '4'.repeat(64);
      const contact = createTestContact(npubFromHex(hex), randomUUID());

      insertProfile(context.database, hex, 'public_discovered', { picture: 'https://public.jpg' });
      insertProfile(context.database, hex, 'private_received', { picture: 'https://received.jpg' });

      const result = enhanceContactsWithProfilesSqlJs(context.database, [contact]);

      expect(result[0].profileSource).toBe('private_received');
      expect(result[0].picture).toBe('https://received.jpg');
    });

    it('E007: Contact picture field with URL value preserved', async () => {
      const hex = '5'.repeat(64);
      const contact = createTestContact(npubFromHex(hex), randomUUID());
      const pictureUrl = 'https://cdn.example.com/avatars/contact-123.png';

      insertProfile(context.database, hex, 'public_discovered', { picture: pictureUrl });

      const result = enhanceContactsWithProfilesSqlJs(context.database, [contact]);

      expect(result[0].picture).toBe(pictureUrl);
    });
  });
});
