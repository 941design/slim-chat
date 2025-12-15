/**
 * Service Layer: Profile Status Enhancement
 *
 * Modifies NostlingService.listIdentities() and listContacts() to populate
 * profileSource and picture fields from nostr_profiles table.
 *
 * IMPLEMENTATION TASK: pbt-dev agent
 *
 * This stub defines the integration point for enhancing existing service methods.
 * Implementation will modify the service.ts file to call enhancement functions
 * after querying identities/contacts.
 */

import type { NostlingIdentity, NostlingContact } from '../../shared/types';
import type { Database } from 'sql.js';
import type { ProfileContent } from '../../shared/profile-types';
import { nip19 } from 'nostr-tools';
import { log } from '../logging';

/**
 * Profile status structure (internal use)
 */
interface ProfileStatus {
  source: 'private_authored' | 'public_discovered' | 'private_received';
  picture: string | null;
}

/**
 * Helper to convert npub to hex with error handling
 */
function npubToHex(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type === 'npub') {
      return decoded.data;
    }
    return null;
  } catch (error) {
    log('error', `Failed to decode npub: ${npub}`);
    return null;
  }
}

/**
 * Helper to parse profile content and extract picture
 */
function extractPictureFromContent(contentJson: string): string | null {
  try {
    const content: ProfileContent = JSON.parse(contentJson);
    return content.picture ?? null;
  } catch (error) {
    log('warn', `Failed to parse profile content`);
    return null;
  }
}

/**
 * Helper to select the highest priority profile from multiple sources
 * Returns the profile with highest priority, or null if none exist
 */
function selectHighestPriorityProfile(
  profiles: ProfileStatus[],
  priorityOrder: string[]
): ProfileStatus | null {
  if (profiles.length === 0) return null;

  // Sort by priority order
  profiles.sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a.source);
    const bIndex = priorityOrder.indexOf(b.source);
    return aIndex - bIndex;
  });

  return profiles[0];
}

/**
 * Enhance identities with profile status (SQL.js version)
 *
 * CONTRACT:
 *   Inputs:
 *     - database: SQL.js Database instance, valid and ready
 *     - identities: array of NostlingIdentity from service query
 *       - Already has id, npub, label, profileName (from display-name-resolver), etc.
 *
 *   Outputs:
 *     - Array of NostlingIdentity with profileSource and picture fields populated
 *     - Same length and order as input
 *
 *   Invariants:
 *     - Output[i].id equals input[i].id for all i
 *     - Existing fields unchanged (non-destructive enhancement)
 *     - profileSource in ['private_authored', 'public_discovered', null]
 *
 *   Properties:
 *     - Batch efficiency: single SQL query for all identities
 *     - Graceful: missing profiles result in null fields
 *
 *   Algorithm:
 *     1. Extract hex pubkeys from identities:
 *        - Convert each identity.npub to hex format using nip19.decode
 *        - Build comma-separated placeholders for SQL IN clause
 *     2. Query nostr_profiles table:
 *        - SELECT owner_pubkey, source, content_json
 *        - WHERE owner_pubkey IN (pubkey1, pubkey2, ...)
 *        - WHERE source IN ('private_authored', 'public_discovered')
 *     3. Build pubkey -> ProfileStatus map:
 *        - For each row:
 *          - Parse content_json as ProfileContent
 *          - Extract picture field
 *          - Store {source, picture} in map[owner_pubkey]
 *        - Apply priority: private_authored > public_discovered
 *     4. Enhance each identity:
 *        - Convert npub to hex
 *        - Lookup in map
 *        - Return new object with profileSource and picture added
 *     5. Return enhanced array
 *
 *   Error Handling:
 *     - Invalid npub: log error, skip enhancement for that identity
 *     - Malformed content_json: log warning, treat as null picture
 *     - SQL error: propagate exception
 */
export function enhanceIdentitiesWithProfilesSqlJs(
  database: Database,
  identities: NostlingIdentity[]
): NostlingIdentity[] {
  log('debug', `[profile-status] enhanceIdentitiesWithProfilesSqlJs called with ${identities.length} identities`);

  // Step 1: Extract hex pubkeys
  const pubkeyHexes: string[] = [];
  const pubkeyToIndex = new Map<string, number[]>();

  identities.forEach((identity, index) => {
    const pubkeyHex = npubToHex(identity.npub);
    if (pubkeyHex) {
      pubkeyHexes.push(pubkeyHex);
      if (!pubkeyToIndex.has(pubkeyHex)) {
        pubkeyToIndex.set(pubkeyHex, []);
      }
      pubkeyToIndex.get(pubkeyHex)!.push(index);
    }
  });

  // Step 2: Query profiles from database
  const profileMap = new Map<string, ProfileStatus>();

  if (pubkeyHexes.length > 0) {
    const sources = ['private_authored', 'public_discovered'];
    const placeholders = pubkeyHexes.map(() => '?').join(',');
    const sourcePlaceholders = sources.map(() => '?').join(',');

    const query = `
      SELECT owner_pubkey, source, content_json
      FROM nostr_profiles
      WHERE owner_pubkey IN (${placeholders})
      AND source IN (${sourcePlaceholders})
      ORDER BY owner_pubkey, source
    `;

    log('debug', `[profile-status] Querying profiles for ${pubkeyHexes.length} identity pubkeys`);

    const stmt = database.prepare(query);
    stmt.bind([...pubkeyHexes, ...sources]);

    const profilesByPubkey = new Map<string, ProfileStatus[]>();
    let rowCount = 0;

    while (stmt.step()) {
      rowCount++;
      const row = stmt.getAsObject() as {
        owner_pubkey: string;
        source: string;
        content_json: string;
      };

      const picture = extractPictureFromContent(row.content_json);
      const status: ProfileStatus = {
        source: row.source as 'private_authored' | 'public_discovered',
        picture,
      };

      if (!profilesByPubkey.has(row.owner_pubkey)) {
        profilesByPubkey.set(row.owner_pubkey, []);
      }
      profilesByPubkey.get(row.owner_pubkey)!.push(status);
    }

    stmt.free();
    log('debug', `[profile-status] Found ${rowCount} profile rows for identities, ${profilesByPubkey.size} unique pubkeys`);

    // Step 3: Apply priority logic (private_authored > public_discovered)
    const priorityOrder = ['private_authored', 'public_discovered'];
    for (const [pubkey, profiles] of profilesByPubkey) {
      const selected = selectHighestPriorityProfile(profiles, priorityOrder);
      if (selected) {
        profileMap.set(pubkey, selected);
      }
    }
    log('debug', `[profile-status] Selected ${profileMap.size} identity profiles after priority logic`);
  }

  // Step 4 & 5: Enhance identities and return
  const enhanced = identities.map((identity) => {
    const pubkeyHex = npubToHex(identity.npub);
    const profile = pubkeyHex ? profileMap.get(pubkeyHex) : null;

    return {
      ...identity,
      profileSource: (profile?.source ?? null) as 'private_authored' | 'public_discovered' | null,
      picture: profile?.picture ?? null,
    };
  });

  const withProfiles = enhanced.filter(i => i.profileSource !== null);
  log('debug', `[profile-status] Enhanced ${identities.length} identities, ${withProfiles.length} have profiles`);

  return enhanced;
}

/**
 * Enhance contacts with profile status (SQL.js version)
 *
 * CONTRACT:
 *   Inputs:
 *     - database: SQL.js Database instance, valid and ready
 *     - contacts: array of NostlingContact from service query
 *       - Already has id, npub, alias, profileName (from display-name-resolver), etc.
 *
 *   Outputs:
 *     - Array of NostlingContact with profileSource and picture fields populated
 *     - Same length and order as input
 *
 *   Invariants:
 *     - Output[i].id equals input[i].id for all i
 *     - Existing fields unchanged (non-destructive enhancement)
 *     - profileSource in ['private_received', 'public_discovered', null]
 *
 *   Properties:
 *     - Batch efficiency: single SQL query for all contacts
 *     - Graceful: missing profiles result in null fields
 *
 *   Algorithm:
 *     1. Extract hex pubkeys from contacts:
 *        - Convert each contact.npub to hex format using nip19.decode
 *        - Build comma-separated placeholders for SQL IN clause
 *     2. Query nostr_profiles table:
 *        - SELECT owner_pubkey, source, content_json
 *        - WHERE owner_pubkey IN (pubkey1, pubkey2, ...)
 *        - WHERE source IN ('private_received', 'public_discovered')
 *     3. Build pubkey -> ProfileStatus map:
 *        - For each row:
 *          - Parse content_json as ProfileContent
 *          - Extract picture field
 *          - Store {source, picture} in map[owner_pubkey]
 *        - Apply priority: private_received > public_discovered
 *     4. Enhance each contact:
 *        - Convert npub to hex
 *        - Lookup in map
 *        - Return new object with profileSource and picture added
 *     5. Return enhanced array
 *
 *   Error Handling:
 *     - Invalid npub: log error, skip enhancement for that contact
 *     - Malformed content_json: log warning, treat as null picture
 *     - SQL error: propagate exception
 */
export function enhanceContactsWithProfilesSqlJs(
  database: Database,
  contacts: NostlingContact[]
): NostlingContact[] {
  log('debug', `[profile-status] enhanceContactsWithProfilesSqlJs called with ${contacts.length} contacts`);

  // Step 1: Extract hex pubkeys
  const pubkeyHexes: string[] = [];
  const pubkeyToIndex = new Map<string, number[]>();

  contacts.forEach((contact, index) => {
    const pubkeyHex = npubToHex(contact.npub);
    if (pubkeyHex) {
      pubkeyHexes.push(pubkeyHex);
      if (!pubkeyToIndex.has(pubkeyHex)) {
        pubkeyToIndex.set(pubkeyHex, []);
      }
      pubkeyToIndex.get(pubkeyHex)!.push(index);
    }
  });

  // Step 2: Query profiles from database
  const profileMap = new Map<string, ProfileStatus>();

  if (pubkeyHexes.length > 0) {
    const sources = ['private_received', 'public_discovered'];
    const placeholders = pubkeyHexes.map(() => '?').join(',');
    const sourcePlaceholders = sources.map(() => '?').join(',');

    const query = `
      SELECT owner_pubkey, source, content_json
      FROM nostr_profiles
      WHERE owner_pubkey IN (${placeholders})
      AND source IN (${sourcePlaceholders})
      ORDER BY owner_pubkey, source
    `;

    log('debug', `[profile-status] Querying profiles for ${pubkeyHexes.length} contact pubkeys`);

    const stmt = database.prepare(query);
    stmt.bind([...pubkeyHexes, ...sources]);

    const profilesByPubkey = new Map<string, ProfileStatus[]>();
    let rowCount = 0;

    while (stmt.step()) {
      rowCount++;
      const row = stmt.getAsObject() as {
        owner_pubkey: string;
        source: string;
        content_json: string;
      };

      const picture = extractPictureFromContent(row.content_json);
      const status: ProfileStatus = {
        source: row.source as 'private_received' | 'public_discovered',
        picture,
      };

      if (!profilesByPubkey.has(row.owner_pubkey)) {
        profilesByPubkey.set(row.owner_pubkey, []);
      }
      profilesByPubkey.get(row.owner_pubkey)!.push(status);
    }

    stmt.free();
    log('debug', `[profile-status] Found ${rowCount} profile rows for contacts, ${profilesByPubkey.size} unique pubkeys`);

    // Step 3: Apply priority logic (private_received > public_discovered)
    const priorityOrder = ['private_received', 'public_discovered'];
    for (const [pubkey, profiles] of profilesByPubkey) {
      const selected = selectHighestPriorityProfile(profiles, priorityOrder);
      if (selected) {
        profileMap.set(pubkey, selected);
      }
    }
    log('debug', `[profile-status] Selected ${profileMap.size} contact profiles after priority logic`);
  }

  // Step 4 & 5: Enhance contacts and return
  const enhanced = contacts.map((contact) => {
    const pubkeyHex = npubToHex(contact.npub);
    const profile = pubkeyHex ? profileMap.get(pubkeyHex) : null;

    return {
      ...contact,
      profileSource: (profile?.source ?? null) as 'private_received' | 'public_discovered' | null,
      picture: profile?.picture ?? null,
    };
  });

  const withProfiles = enhanced.filter(c => c.profileSource !== null);
  log('debug', `[profile-status] Enhanced ${contacts.length} contacts, ${withProfiles.length} have profiles`);

  return enhanced;
}

/**
 * Integration point: Modify NostlingService
 *
 * TASK FOR pbt-dev:
 *   1. Import enhanceIdentitiesWithProfilesSqlJs and enhanceContactsWithProfilesSqlJs
 *   2. In listIdentities() method:
 *      - After building identities array (after display name resolution loop)
 *      - Before stmt.free()
 *      - Call: identities = enhanceIdentitiesWithProfilesSqlJs(this.database, identities)
 *   3. In listContacts() method:
 *      - After building contacts array (after display name resolution loop)
 *      - Before stmt.free()
 *      - Call: contacts = enhanceContactsWithProfilesSqlJs(this.database, contacts)
 *
 * File to modify: src/main/nostling/service.ts
 * Lines to modify:
 *   - listIdentities: around line 107-140
 *   - listContacts: around line 235-270
 */
