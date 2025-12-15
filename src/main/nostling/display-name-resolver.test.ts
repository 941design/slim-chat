/**
 * Display Name Resolver Tests
 *
 * Property-based tests for display name resolution with precedence logic.
 * Tests cover alias > private > public > npub fallback hierarchy.
 */

import * as fc from 'fast-check';
import initSqlJs, { Database } from 'sql.js';
import { randomUUID } from 'node:crypto';
import {
  resolveDisplayName,
  resolveDisplayNameForContact,
  resolveDisplayNameForIdentity,
  extractNameFromProfile
} from './display-name-resolver';
import { generateKeypair } from './crypto';

let SQL: any;
let database: Database;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  database = new SQL.Database();

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
    CREATE TABLE nostr_contacts (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      npub TEXT NOT NULL,
      alias TEXT,
      state TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database.run(`
    CREATE TABLE nostr_identities (
      id TEXT PRIMARY KEY,
      npub TEXT NOT NULL,
      secret_ref TEXT NOT NULL,
      label TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

afterEach(() => {
  database.close();
});

// ============================================================================
// Arbitraries
// ============================================================================

const hexString64 = fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 32, maxLength: 32 })
  .map(bytes => bytes.map(b => b.toString(16).padStart(2, '0')).join(''));

const profileNameArbitrary = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  fc.constant(undefined)
);

const aliasArbitrary = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  fc.constant(null)
);

const whitespacePaddedString = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => s.trim().length > 0)
  .map(s => `  ${s}  `);

// ============================================================================
// extractNameFromProfile Tests
// ============================================================================

describe('extractNameFromProfile', () => {
  test('prioritizes name over display_name', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (name, displayName) => {
          const result = extractNameFromProfile({ name, display_name: displayName });
          return result === name.trim();
        }
      )
    );
  });

  test('falls back to display_name when name is missing', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (displayName) => {
          const result = extractNameFromProfile({ display_name: displayName });
          return result === displayName.trim();
        }
      )
    );
  });

  test('returns null when both fields are missing', () => {
    fc.assert(
      fc.property(
        fc.record({}),
        (content) => {
          const result = extractNameFromProfile(content);
          return result === null;
        }
      )
    );
  });

  test('returns null when both fields are empty or whitespace', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(''), fc.constant('   '), fc.constant('\t\n')),
        fc.oneof(fc.constant(''), fc.constant('   '), fc.constant('\t\n')),
        (name, displayName) => {
          const result = extractNameFromProfile({ name, display_name: displayName });
          return result === null;
        }
      )
    );
  });

  test('trims whitespace from returned name', () => {
    fc.assert(
      fc.property(
        whitespacePaddedString,
        (paddedName) => {
          const result = extractNameFromProfile({ name: paddedName });
          return result === paddedName.trim() && result !== null && !result.startsWith(' ') && !result.endsWith(' ');
        }
      )
    );
  });
});

// ============================================================================
// resolveDisplayName Tests
// ============================================================================

describe('resolveDisplayName', () => {
  test('alias takes precedence over all other sources', () => {
    fc.assert(
      fc.property(
        hexString64,
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (pubkey, alias, privateName, publicName) => {
          insertProfile(database, pubkey, 'private_received', { name: privateName });
          insertProfile(database, pubkey, 'public_discovered', { name: publicName });

          const result = resolveDisplayName(pubkey, alias, database);

          return result.displayName === alias.trim() && result.source === 'alias' && result.profile === undefined;
        }
      )
    );
  });

  test('private profile takes precedence over public when no alias', () => {
    fc.assert(
      fc.property(
        hexString64,
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (pubkey, privateName, publicName) => {
          insertProfile(database, pubkey, 'private_received', { name: privateName });
          insertProfile(database, pubkey, 'public_discovered', { name: publicName });

          const result = resolveDisplayName(pubkey, null, database);

          return result.displayName === privateName.trim() && result.source === 'private' && result.profile !== undefined;
        }
      )
    );
  });

  test('public profile used when no alias or private profile', () => {
    fc.assert(
      fc.property(
        hexString64,
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (pubkey, publicName) => {
          insertProfile(database, pubkey, 'public_discovered', { name: publicName });

          const result = resolveDisplayName(pubkey, null, database);

          return result.displayName === publicName.trim() && result.source === 'public' && result.profile !== undefined;
        }
      )
    );
  });

  test('npub fallback when no alias or profiles', () => {
    fc.assert(
      fc.property(
        hexString64,
        (pubkey) => {
          const result = resolveDisplayName(pubkey, null, database);

          return (
            result.source === 'npub' &&
            result.profile === undefined &&
            result.displayName.startsWith('npub1') &&
            result.displayName.includes('...') &&
            result.displayName.length === 15
          );
        }
      )
    );
  });

  test('npub fallback format is consistent', () => {
    fc.assert(
      fc.property(
        hexString64,
        (pubkey) => {
          const result = resolveDisplayName(pubkey, null, database);
          const parts = result.displayName.split('...');

          return parts.length === 2 && parts[0].length === 8 && parts[1].length === 4;
        }
      )
    );
  });

  test('empty or whitespace-only alias is ignored', () => {
    fc.assert(
      fc.property(
        hexString64,
        fc.oneof(fc.constant(''), fc.constant('   '), fc.constant('\t\n')),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (pubkey, emptyAlias, privateName) => {
          insertProfile(database, pubkey, 'private_received', { name: privateName });

          const result = resolveDisplayName(pubkey, emptyAlias, database);

          return result.source === 'private' && result.displayName === privateName.trim();
        }
      )
    );
  });

  test('profile with only display_name works correctly', () => {
    fc.assert(
      fc.property(
        hexString64,
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (pubkey, displayName) => {
          insertProfile(database, pubkey, 'private_received', { display_name: displayName });

          const result = resolveDisplayName(pubkey, null, database);

          return result.displayName === displayName.trim() && result.source === 'private';
        }
      )
    );
  });

  test('profile with empty name fields falls back to next precedence level', () => {
    fc.assert(
      fc.property(
        hexString64,
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (pubkey, publicName) => {
          insertProfile(database, pubkey, 'private_received', { name: '', display_name: '   ' });
          insertProfile(database, pubkey, 'public_discovered', { name: publicName });

          const result = resolveDisplayName(pubkey, null, database);

          return result.displayName === publicName.trim() && result.source === 'public';
        }
      )
    );
  });

  test('always returns non-empty displayName', () => {
    fc.assert(
      fc.property(
        hexString64,
        aliasArbitrary,
        (pubkey: string, alias: string | null) => {
          const result = resolveDisplayName(pubkey, alias, database);

          return result.displayName.length > 0;
        }
      )
    );
  });

  test('profile field is defined only for private and public sources', () => {
    fc.assert(
      fc.property(
        hexString64,
        aliasArbitrary,
        profileNameArbitrary,
        profileNameArbitrary,
        (pubkey: string, alias: string | null, privateName: string | undefined, publicName: string | undefined) => {
          if (privateName) {
            insertProfile(database, pubkey, 'private_received', { name: privateName });
          }
          if (publicName) {
            insertProfile(database, pubkey, 'public_discovered', { name: publicName });
          }

          const result = resolveDisplayName(pubkey, alias, database);

          if (result.source === 'alias' || result.source === 'npub') {
            return result.profile === undefined;
          } else {
            return result.profile !== undefined;
          }
        }
      )
    );
  });
});

// ============================================================================
// resolveDisplayNameForContact Tests
// ============================================================================

describe('resolveDisplayNameForContact', () => {
  test('throws when contact not found', () => {
    expect(() => {
      resolveDisplayNameForContact(randomUUID(), database);
    }).toThrow('Contact not found');
  });

  test('resolves display name using contact alias and npub', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (alias) => {
          const keypair = generateKeypair();
          const contactId = randomUUID();

          database.run(`
            INSERT INTO nostr_contacts (id, identity_id, npub, alias, state)
            VALUES (?, ?, ?, ?, 'active')
          `, [contactId, randomUUID(), keypair.keypair.npub, alias]);

          const result = resolveDisplayNameForContact(contactId, database);

          return result.displayName === alias.trim() && result.source === 'alias';
        }
      )
    );
  });

  test('falls back to profile when contact has no alias', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (profileName) => {
          const keypair = generateKeypair();
          const contactId = randomUUID();

          insertProfile(database, keypair.keypair.pubkeyHex, 'private_received', { name: profileName });

          database.run(`
            INSERT INTO nostr_contacts (id, identity_id, npub, alias, state)
            VALUES (?, ?, ?, NULL, 'active')
          `, [contactId, randomUUID(), keypair.keypair.npub]);

          const result = resolveDisplayNameForContact(contactId, database);

          return result.displayName === profileName.trim() && result.source === 'private';
        }
      )
    );
  });
});

// ============================================================================
// resolveDisplayNameForIdentity Tests
// ============================================================================

describe('resolveDisplayNameForIdentity', () => {
  test('throws when identity not found', () => {
    expect(() => {
      resolveDisplayNameForIdentity(randomUUID(), database);
    }).toThrow('Identity not found');
  });

  test('uses label as highest precedence', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (label, profileName) => {
          const keypair = generateKeypair();
          const identityId = randomUUID();

          insertProfile(database, keypair.keypair.pubkeyHex, 'private_authored', { name: profileName });

          database.run(`
            INSERT INTO nostr_identities (id, npub, secret_ref, label)
            VALUES (?, ?, ?, ?)
          `, [identityId, keypair.keypair.npub, 'dummy-secret', label]);

          const result = resolveDisplayNameForIdentity(identityId, database);

          return result.displayName === label.trim() && result.source === 'alias';
        }
      )
    );
  });

  test('uses private_authored profile when no label', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (profileName) => {
          const keypair = generateKeypair();
          const identityId = randomUUID();

          insertProfile(database, keypair.keypair.pubkeyHex, 'private_authored', { name: profileName });

          database.run(`
            INSERT INTO nostr_identities (id, npub, secret_ref, label)
            VALUES (?, ?, ?, NULL)
          `, [identityId, keypair.keypair.npub, 'dummy-secret']);

          const result = resolveDisplayNameForIdentity(identityId, database);

          return result.displayName === profileName.trim() && result.source === 'private';
        }
      )
    );
  });

  test('falls back to public profile when no label or private_authored', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (publicName) => {
          const keypair = generateKeypair();
          const identityId = randomUUID();

          insertProfile(database, keypair.keypair.pubkeyHex, 'public_discovered', { name: publicName });

          database.run(`
            INSERT INTO nostr_identities (id, npub, secret_ref, label)
            VALUES (?, ?, ?, NULL)
          `, [identityId, keypair.keypair.npub, 'dummy-secret']);

          const result = resolveDisplayNameForIdentity(identityId, database);

          return result.displayName === publicName.trim() && result.source === 'public';
        }
      )
    );
  });

  test('does NOT use private_received for identities', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        (profileName) => {
          const keypair = generateKeypair();
          const identityId = randomUUID();

          insertProfile(database, keypair.keypair.pubkeyHex, 'private_received', { name: profileName });

          database.run(`
            INSERT INTO nostr_identities (id, npub, secret_ref, label)
            VALUES (?, ?, ?, NULL)
          `, [identityId, keypair.keypair.npub, 'dummy-secret']);

          const result = resolveDisplayNameForIdentity(identityId, database);

          return result.source === 'npub';
        }
      )
    );
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function insertProfile(
  db: Database,
  ownerPubkey: string,
  source: 'private_received' | 'public_discovered' | 'private_authored',
  content: { name?: string; display_name?: string }
): void {
  const id = randomUUID();
  const contentJson = JSON.stringify(content);
  const timestamp = new Date().toISOString();

  db.run(`
    INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `, [id, ownerPubkey, source, contentJson, null, timestamp, timestamp]);
}
