/**
 * Public Profile Discovery
 *
 * Periodically queries configured relays for public kind:0 metadata events.
 * Updates presence indicators and stores discovered profiles.
 *
 * Related: specs/private-profile-sharing.md FR6
 */

import { randomUUID } from 'crypto';
import { Database } from 'sql.js';
import { PublicProfilePresence, ProfileContent } from '../../shared/profile-types';
import { RelayPool, Filter } from './relay-pool';
import { npubToHex } from './crypto';
import { log } from '../logging';

// ============================================================================
// STUB: discoverPublicProfile
// ============================================================================

/**
 * Queries relays for public kind:0 profile for a single pubkey
 *
 * CONTRACT:
 *   Inputs:
 *     - pubkey: string, hex-encoded pubkey to query
 *       Constraints: 64-character hex string
 *     - relayPool: RelayPool connected to configured relays
 *       Constraints: initialized relay pool with at least one relay
 *     - database: Database for storing presence and profile data
 *       Constraints: contains nostr_public_profile_presence and nostr_profiles tables
 *
 *   Outputs:
 *     - presence: PublicProfilePresence with updated check status
 *
 *   Invariants:
 *     - Always updates last_checked_at timestamp
 *     - exists=true only if kind:0 event found AND relay query succeeded
 *     - exists=false if relay query succeeded but no kind:0 found
 *     - last_check_success=false if relay query failed (network error, timeout, etc.)
 *     - If exists=true, profile content is stored in nostr_profiles with source='public_discovered'
 *
 *   Properties:
 *     - Indicator behavior: show indicator only when exists=true AND last_check_success=true
 *     - Hide indicator if last_check_success=false (unknown state, don't show stale data)
 *     - Profile storage: discovered kind:0 content stored for display name resolution
 *
 *   Algorithm:
 *     1. Create relay filter: { kinds: [0], authors: [pubkey], limit: 1 }
 *     2. Query relay pool with filter (use subscription or one-time query)
 *     3. Wait for response or timeout (reasonable timeout: 5 seconds)
 *     4. If relay error or timeout:
 *        a. Update presence: last_checked_at=now, last_check_success=false, exists=false
 *        b. Return presence
 *     5. If relay succeeds but no events:
 *        a. Update presence: last_checked_at=now, last_check_success=true, exists=false, last_seen_event_id=null
 *        b. Return presence
 *     6. If kind:0 event found:
 *        a. Parse content as ProfileContent JSON
 *        b. Store/update in nostr_profiles with source='public_discovered'
 *        c. Update presence: last_checked_at=now, last_check_success=true, exists=true, last_seen_event_id=event.id
 *        d. Return presence
 *
 *   Error Conditions:
 *     - Relay query fails → set last_check_success=false, don't throw
 *     - JSON parsing fails → log warning, set exists=false, don't throw
 *     - Database update fails → log error but return presence state
 *
 * TODO (pbt-dev): Implement relay query with timeout
 *   - Use relayPool subscription or query method
 *   - Implement timeout mechanism (Promise.race with setTimeout)
 *   - Handle relay errors gracefully
 *   - Update both nostr_public_profile_presence and nostr_profiles tables
 *   - Return PublicProfilePresence with all fields populated
 */
export async function discoverPublicProfile(
  pubkey: string,
  relayPool: RelayPool,
  database: Database
): Promise<PublicProfilePresence> {
  const now = new Date().toISOString();
  const filter: Filter = { kinds: [0], authors: [pubkey], limit: 1 };

  let exists = false;
  let lastCheckSuccess = false;
  let lastSeenEventId: string | null = null;

  try {
    const events = await relayPool.querySync([filter], { maxWait: 5000 });

    if (events.length === 0) {
      lastCheckSuccess = true;
      exists = false;
      lastSeenEventId = null;
    } else {
      const event = events[0];
      lastCheckSuccess = true;
      exists = true;
      lastSeenEventId = event.id;

      try {
        const content: ProfileContent = JSON.parse(event.content);

        // Profile storage wrapped in transaction to ensure atomicity
        database.run('BEGIN TRANSACTION');
        try {
          const stmt = database.prepare(
            `INSERT OR REPLACE INTO nostr_profiles
             (id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          );
          stmt.run([
            randomUUID(),
            pubkey,
            'public_discovered',
            JSON.stringify(content),
            event.id,
            1,
            now,
            now
          ]);
          stmt.free();
          database.run('COMMIT');
        } catch (dbError) {
          database.run('ROLLBACK');
          throw dbError;
        }
      } catch (parseError) {
        log('warn', `Failed to parse kind:0 content for ${pubkey}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        exists = false;
        lastSeenEventId = null;
      }
    }
  } catch (relayError) {
    log('error', `Relay query failed for ${pubkey}: ${relayError instanceof Error ? relayError.message : String(relayError)}`);
    lastCheckSuccess = false;
    exists = false;
    lastSeenEventId = null;
  }

  // Presence update wrapped in transaction to ensure atomicity
  let presenceId: string;
  database.run('BEGIN TRANSACTION');
  try {
    const checkStmt = database.prepare('SELECT id FROM nostr_public_profile_presence WHERE pubkey = ?');
    checkStmt.bind([pubkey]);
    const existingRow = checkStmt.step();
    const existingId = existingRow ? (checkStmt.getAsObject().id as string) : null;
    checkStmt.free();

    presenceId = existingId || randomUUID();

    const updateStmt = database.prepare(
      `INSERT OR REPLACE INTO nostr_public_profile_presence
       (id, pubkey, has_public_profile, last_checked_at, last_check_success, last_seen_event_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    updateStmt.run([
      presenceId,
      pubkey,
      exists ? 1 : 0,
      now,
      lastCheckSuccess ? 1 : 0,
      lastSeenEventId
    ]);
    updateStmt.free();

    database.run('COMMIT');
  } catch (presenceError) {
    database.run('ROLLBACK');
    throw presenceError;
  }

  return {
    id: presenceId,
    pubkey,
    exists,
    lastCheckedAt: now,
    lastCheckSuccess,
    lastSeenEventId: lastSeenEventId || undefined
  };
}

// ============================================================================
// STUB: discoverPublicProfilesForIdentityAndContacts
// ============================================================================

/**
 * Discovers public profiles for an identity and all their contacts
 *
 * CONTRACT:
 *   Inputs:
 *     - identityId: string, UUID of identity
 *       Constraints: exists in nostr_identities table
 *     - relayPool: RelayPool for queries
 *       Constraints: initialized relay pool
 *     - database: Database for querying identities/contacts and storing results
 *       Constraints: contains nostr_identities, nostr_contacts, nostr_public_profile_presence, nostr_profiles tables
 *
 *   Outputs:
 *     - results: array of PublicProfilePresence, one for identity + one per contact
 *
 *   Invariants:
 *     - First result is for identity pubkey
 *     - Subsequent results are for contact pubkeys (active contacts only)
 *     - All pubkeys receive discovery attempt
 *
 *   Properties:
 *     - Completeness: identity + all active contacts checked
 *     - Independence: one pubkey's failure doesn't block others
 *     - Best-effort: partial failures are acceptable
 *
 *   Algorithm:
 *     1. Query identity pubkey from nostr_identities WHERE id = identityId
 *     2. Query all active contact pubkeys from nostr_contacts WHERE identity_id = ? AND deleted_at IS NULL
 *     3. Collect all pubkeys (identity + contacts) into array
 *     4. For each pubkey, call discoverPublicProfile
 *     5. Collect all results and return
 *
 *   Error Conditions:
 *     - Identity not found → throw Error "Identity not found"
 *     - No contacts → return array with only identity result (not an error)
 *     - Individual discovery failures → captured in PublicProfilePresence.last_check_success
 *
 * TODO (pbt-dev): Implement identity + contacts iteration
 *   - Query identity and contacts from database
 *   - Convert npubs to hex pubkeys (use npubToHex from crypto.ts)
 *   - Call discoverPublicProfile for each pubkey
 *   - Return array of all results
 */
export async function discoverPublicProfilesForIdentityAndContacts(
  identityId: string,
  relayPool: RelayPool,
  database: Database
): Promise<PublicProfilePresence[]> {
  const identityStmt = database.prepare('SELECT npub FROM nostr_identities WHERE id = ? LIMIT 1');
  identityStmt.bind([identityId]);
  const hasIdentity = identityStmt.step();
  const identityNpub = hasIdentity ? (identityStmt.getAsObject().npub as string) : null;
  identityStmt.free();

  if (!identityNpub) {
    throw new Error('Identity not found');
  }

  const identityPubkey = npubToHex(identityNpub);

  const contactsStmt = database.prepare(
    'SELECT npub FROM nostr_contacts WHERE identity_id = ? AND deleted_at IS NULL'
  );
  contactsStmt.bind([identityId]);

  const contactPubkeys: string[] = [];
  while (contactsStmt.step()) {
    const contactNpub = contactsStmt.getAsObject().npub as string;
    contactPubkeys.push(npubToHex(contactNpub));
  }
  contactsStmt.free();

  const allPubkeys = [identityPubkey, ...contactPubkeys];
  const results: PublicProfilePresence[] = [];

  for (const pubkey of allPubkeys) {
    try {
      const presence = await discoverPublicProfile(pubkey, relayPool, database);
      results.push(presence);
    } catch (error) {
      log('error', `Failed to discover profile for ${pubkey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return results;
}

// ============================================================================
// STUB: schedulePublicProfileDiscovery
// ============================================================================

/**
 * Sets up periodic public profile discovery (hourly)
 *
 * CONTRACT:
 *   Inputs:
 *     - identityId: string, UUID of identity to track
 *       Constraints: exists in nostr_identities table
 *     - relayPool: RelayPool for queries
 *       Constraints: initialized relay pool
 *     - database: Database for storage
 *       Constraints: contains required tables
 *
 *   Outputs:
 *     - cleanup: function to stop the scheduled discovery
 *       Constraints: calling cleanup() stops the interval timer
 *
 *   Invariants:
 *     - Discovery runs immediately on schedule
 *     - Discovery runs every hour thereafter
 *     - Cleanup function properly clears interval
 *
 *   Properties:
 *     - Periodic: discovery runs at regular hourly intervals
 *     - Immediate: first discovery runs without delay
 *     - Stoppable: cleanup function halts scheduling
 *
 *   Algorithm:
 *     1. Run discoverPublicProfilesForIdentityAndContacts immediately
 *     2. Set interval to run every 60 minutes (3600000 ms)
 *     3. Return cleanup function that clears the interval
 *
 *   Error Conditions:
 *     - Discovery errors are logged but don't stop scheduling
 *
 * TODO (pbt-dev): Implement using setInterval
 *   - Call discovery function immediately
 *   - Use setInterval(fn, 3600000) for hourly execution
 *   - Return cleanup: () => clearInterval(intervalId)
 *   - Handle errors within discovery without crashing scheduler
 */
export function schedulePublicProfileDiscovery(
  identityId: string,
  relayPool: RelayPool,
  database: Database
): () => void {
  const runDiscovery = async () => {
    try {
      await discoverPublicProfilesForIdentityAndContacts(identityId, relayPool, database);
    } catch (error) {
      log('error', `Scheduled profile discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  runDiscovery();

  const intervalId = setInterval(runDiscovery, 3600000);

  return () => {
    clearInterval(intervalId);
  };
}

// ============================================================================
// STUB: getPublicProfilePresence
// ============================================================================

/**
 * Retrieves public profile presence indicator for a pubkey
 *
 * CONTRACT:
 *   Inputs:
 *     - pubkey: string, hex-encoded pubkey
 *       Constraints: 64-character hex string
 *     - database: Database to query
 *       Constraints: contains nostr_public_profile_presence table
 *
 *   Outputs:
 *     - presence: PublicProfilePresence if exists, null if never checked
 *
 *   Invariants:
 *     - Returns null if pubkey has never been checked
 *     - Returns valid presence if at least one check has been performed
 *
 *   Properties:
 *     - Existence check: null means no discovery attempted yet
 *     - State reflection: returned data reflects most recent discovery attempt
 *
 *   Algorithm:
 *     1. Query nostr_public_profile_presence WHERE pubkey = ?
 *     2. If no row, return null
 *     3. If row found, map to PublicProfilePresence and return
 *
 *   Error Conditions:
 *     - Database query fails → throw Error "Failed to query presence"
 *
 * TODO (pbt-dev): Implement database query
 *   - SELECT from nostr_public_profile_presence
 *   - Map row to PublicProfilePresence type
 *   - Handle nullable fields
 */
export function getPublicProfilePresence(
  pubkey: string,
  database: Database
): PublicProfilePresence | null {
  try {
    const stmt = database.prepare(
      'SELECT id, pubkey, has_public_profile, last_checked_at, last_check_success, last_seen_event_id FROM nostr_public_profile_presence WHERE pubkey = ? LIMIT 1'
    );
    stmt.bind([pubkey]);
    const hasRow = stmt.step();

    if (!hasRow) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject();
    stmt.free();

    return {
      id: row.id as string,
      pubkey: row.pubkey as string,
      exists: Boolean(row.has_public_profile),
      lastCheckedAt: row.last_checked_at as string | undefined,
      lastCheckSuccess: Boolean(row.last_check_success),
      lastSeenEventId: row.last_seen_event_id as string | undefined
    };
  } catch (error) {
    throw new Error('Failed to query presence');
  }
}
