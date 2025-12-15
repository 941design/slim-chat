/**
 * NIP-59 Profile Receiver
 *
 * Unwraps and stores private profiles received via NIP-59 gift wrap.
 * Validates signatures and updates profile storage.
 *
 * Related: specs/private-profile-sharing.md FR8
 */

import { Database } from 'sql.js';
import { ProfileContent, ProfileRecord, PRIVATE_PROFILE_KIND } from '../../shared/profile-types';
import { NostrEvent } from './crypto';
import { unwrapEvent } from 'nostr-tools/nip59';
import { verifyEvent } from 'nostr-tools/pure';
import { randomUUID } from 'crypto';
import { log } from '../logging';

// ============================================================================
// STUB: handleReceivedWrappedEvent
// ============================================================================

/**
 * Processes a NIP-59 wrapped event to extract and store private profiles
 *
 * CONTRACT:
 *   Inputs:
 *     - wrappedEvent: NostrEvent, outer NIP-59 gift wrap
 *       Constraints: valid NIP-59 wrap event (kind 1059)
 *     - recipientSecretKey: Uint8Array, secret key of receiving identity
 *       Constraints: 32-byte secret key for unwrapping
 *     - database: Database for storing unwrapped profile
 *       Constraints: contains nostr_profiles table
 *
 *   Outputs:
 *     - profile: ProfileRecord if unwrapping reveals private profile event, null otherwise
 *
 *   Invariants:
 *     - Only processes inner events with kind PRIVATE_PROFILE_KIND (30078)
 *     - Other event kinds are ignored (return null without error)
 *     - Signature validation is performed on inner event
 *     - Latest-only rule: replaces previous private profile from same sender
 *
 *   Properties:
 *     - Selective: only handles PRIVATE_PROFILE_KIND events
 *     - Validated: signature of inner event is verified before storage
 *     - Idempotent: receiving same profile multiple times updates same record
 *     - Latest-wins: newer profile from same sender replaces older one
 *
 *   Algorithm:
 *     1. Unwrap gift wrap using NIP-59 unwrapEvent(wrappedEvent, recipientSecretKey)
 *     2. Check if inner event kind equals PRIVATE_PROFILE_KIND (30078)
 *     3. If not 30078, return null (ignore non-profile events)
 *     4. Validate inner event signature matches sender pubkey
 *     5. Parse inner event content as ProfileContent JSON
 *     6. Query database for existing private_received profile from sender pubkey
 *     7. If exists, UPDATE record with new content, event_id, updated_at
 *     8. If not exists, INSERT new record with source='private_received'
 *     9. Return ProfileRecord with stored data
 *
 *   Error Conditions:
 *     - Unwrapping fails (invalid NIP-59 wrap) → log warning, return null
 *     - Inner event signature invalid → log warning, store with valid_signature=false, return record
 *     - Content is not valid JSON → log error, return null
 *     - Database update fails → throw Error "Failed to store profile"
 *
 * TODO (pbt-dev): Implement using nostr-tools NIP-59 functions
 *   - Import { unwrapEvent } from 'nostr-tools/nip59'
 *   - Import { verifyEvent } from 'nostr-tools/pure' for signature validation
 *   - Parse content as JSON and validate as ProfileContent
 *   - Use UPSERT pattern: check for existing record, UPDATE or INSERT
 *   - Handle both success and error cases gracefully
 */
export async function handleReceivedWrappedEvent(
  wrappedEvent: NostrEvent,
  recipientSecretKey: Uint8Array,
  database: Database
): Promise<ProfileRecord | null> {
  log('debug', `[profile-receiver] handleReceivedWrappedEvent called for event ${wrappedEvent.id?.slice(0, 8)}...`);
  let rumor: any;

  try {
    rumor = await unwrapEvent(wrappedEvent, recipientSecretKey);
    log('debug', `[profile-receiver] Successfully unwrapped event, inner kind: ${rumor.kind}`);
  } catch (error) {
    log('warn', `[profile-receiver] Failed to unwrap NIP-59 event: ${error instanceof Error ? error.message : 'unknown error'}`);
    return null;
  }

  if (rumor.kind !== PRIVATE_PROFILE_KIND) {
    log('debug', `[profile-receiver] Ignoring non-profile event with kind ${rumor.kind} (expected ${PRIVATE_PROFILE_KIND})`);
    return null;
  }
  log('debug', `[profile-receiver] Processing private profile from ${rumor.pubkey?.slice(0, 8)}...`);

  // NIP-59 rumors are unsigned by design - authentication comes from successful unwrapping
  // If unwrapEvent succeeded, the rumor is authentic (outer gift wrap was properly signed/decrypted)
  const isValidSignature = true;

  let content: ProfileContent;
  try {
    content = JSON.parse(rumor.content);
  } catch (error) {
    console.error('Failed to parse profile content as JSON:', error instanceof Error ? error.message : 'unknown error');
    return null;
  }

  const ownerPubkey = rumor.pubkey;
  const source = 'private_received';
  const eventId = rumor.id;
  const contentJson = JSON.stringify(content);

  try {
    database.run('BEGIN TRANSACTION');

    try {
      const stmt = database.prepare(
        'SELECT id, created_at FROM nostr_profiles WHERE owner_pubkey = ? AND source = ?'
      );
      stmt.bind([ownerPubkey, source]);
      const existing = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();

      const now = new Date().toISOString();
      let result: ProfileRecord;

      if (existing) {
        const recordId = existing.id as string;
        const createdAt = existing.created_at as string;

        database.run(
          'UPDATE nostr_profiles SET content_json = ?, event_id = ?, valid_signature = ?, updated_at = ? WHERE id = ?',
          [contentJson, eventId, isValidSignature ? 1 : 0, now, recordId]
        );

        result = {
          id: recordId,
          ownerPubkey,
          source,
          content,
          eventId,
          validSignature: isValidSignature,
          createdAt,
          updatedAt: now
        };
      } else {
        const recordId = randomUUID();

        database.run(
          'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [recordId, ownerPubkey, source, contentJson, eventId, isValidSignature ? 1 : 0, now, now]
        );

        result = {
          id: recordId,
          ownerPubkey,
          source,
          content,
          eventId,
          validSignature: isValidSignature,
          createdAt: now,
          updatedAt: now
        };
      }

      database.run('COMMIT');
      return result;
    } catch (innerError) {
      database.run('ROLLBACK');
      throw innerError;
    }
  } catch (error) {
    throw new Error('Failed to store profile: ' + (error instanceof Error ? error.message : 'unknown error'));
  }
}

// ============================================================================
// STUB: getProfileForPubkey
// ============================================================================

/**
 * Retrieves the latest profile for a given pubkey from a specific source
 *
 * CONTRACT:
 *   Inputs:
 *     - pubkey: string, hex-encoded pubkey to query
 *       Constraints: 64-character hex string
 *     - source: ProfileSource, which profile source to query
 *       Constraints: 'private_received' | 'public_discovered' | 'private_authored'
 *     - database: Database to query
 *       Constraints: contains nostr_profiles table
 *
 *   Outputs:
 *     - profile: ProfileRecord if found, null if not exists
 *
 *   Invariants:
 *     - Returns null if no profile exists for (pubkey, source) pair
 *     - Returns most recent profile if multiple exist (ORDER BY updated_at DESC)
 *
 *   Properties:
 *     - Source-specific: only returns profiles from specified source
 *     - Latest-only: if multiple records exist, returns most recent
 *
 *   Algorithm:
 *     1. Query nostr_profiles WHERE owner_pubkey = ? AND source = ? ORDER BY updated_at DESC LIMIT 1
 *     2. If no row, return null
 *     3. If row found, parse content_json and map to ProfileRecord
 *     4. Return ProfileRecord
 *
 *   Error Conditions:
 *     - Database query fails → throw Error "Failed to query profile"
 *     - JSON parsing fails → throw Error "Failed to parse profile content"
 *
 * TODO (pbt-dev): Implement database query and mapping
 *   - Query nostr_profiles table with WHERE clause
 *   - Parse content_json as ProfileContent
 *   - Map database row fields to ProfileRecord type
 *   - Handle nullable fields (event_id)
 */
export function getProfileForPubkey(
  pubkey: string,
  source: 'private_received' | 'public_discovered' | 'private_authored',
  database: Database
): ProfileRecord | null {
  try {
    const stmt = database.prepare(
      'SELECT id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at FROM nostr_profiles WHERE owner_pubkey = ? AND source = ? ORDER BY updated_at DESC LIMIT 1'
    );
    stmt.bind([pubkey, source]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!row) {
      return null;
    }

    let content: ProfileContent;
    try {
      content = JSON.parse(row.content_json as string);
    } catch (error) {
      throw new Error('Failed to parse profile content: ' + (error instanceof Error ? error.message : 'unknown error'));
    }

    return {
      id: row.id as string,
      ownerPubkey: row.owner_pubkey as string,
      source: row.source as 'private_received' | 'public_discovered' | 'private_authored',
      content,
      eventId: row.event_id as string | undefined,
      validSignature: Boolean(row.valid_signature),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    };
  } catch (error) {
    throw new Error('Failed to query profile: ' + (error instanceof Error ? error.message : 'unknown error'));
  }
}

// ============================================================================
// STUB: getAllProfilesForPubkey
// ============================================================================

/**
 * Retrieves all profiles for a given pubkey (all sources)
 *
 * CONTRACT:
 *   Inputs:
 *     - pubkey: string, hex-encoded pubkey
 *       Constraints: 64-character hex string
 *     - database: Database to query
 *       Constraints: contains nostr_profiles table
 *
 *   Outputs:
 *     - profiles: array of ProfileRecord, one per source if exists
 *       Constraints: array length 0-3 (private_received, public_discovered, private_authored)
 *
 *   Invariants:
 *     - Returns empty array if no profiles exist for pubkey
 *     - Returns one record per source (latest from each source)
 *     - Results ordered by source for consistency
 *
 *   Properties:
 *     - Completeness: returns all available sources for pubkey
 *     - Latest per source: if multiple records per source, returns most recent
 *
 *   Algorithm:
 *     1. Query nostr_profiles WHERE owner_pubkey = ? ORDER BY source, updated_at DESC
 *     2. Group by source, take most recent per source
 *     3. Map rows to ProfileRecord array
 *     4. Return array
 *
 *   Error Conditions:
 *     - Database query fails → throw Error "Failed to query profiles"
 *
 * TODO (pbt-dev): Implement multi-source query
 *   - Query all profiles for pubkey
 *   - Deduplicate by source (keep latest per source)
 *   - Map to ProfileRecord array
 */
export function getAllProfilesForPubkey(
  pubkey: string,
  database: Database
): ProfileRecord[] {
  try {
    const stmt = database.prepare(
      'SELECT id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at FROM nostr_profiles WHERE owner_pubkey = ? ORDER BY source, updated_at DESC'
    );
    stmt.bind([pubkey]);

    const profiles: ProfileRecord[] = [];
    const seenSources = new Set<string>();

    while (stmt.step()) {
      const row = stmt.getAsObject();
      const source = row.source as string;

      if (seenSources.has(source)) {
        continue;
      }
      seenSources.add(source);

      let content: ProfileContent;
      try {
        content = JSON.parse(row.content_json as string);
      } catch (error) {
        throw new Error('Failed to parse profile content: ' + (error instanceof Error ? error.message : 'unknown error'));
      }

      profiles.push({
        id: row.id as string,
        ownerPubkey: row.owner_pubkey as string,
        source: row.source as 'private_received' | 'public_discovered' | 'private_authored',
        content,
        eventId: row.event_id as string | undefined,
        validSignature: Boolean(row.valid_signature),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string
      });
    }

    stmt.free();
    return profiles;
  } catch (error) {
    throw new Error('Failed to query profiles: ' + (error instanceof Error ? error.message : 'unknown error'));
  }
}
