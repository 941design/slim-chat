/**
 * NIP-59 Profile Sender
 *
 * Sends private profiles to contacts via NIP-59 gift wrap.
 * Tracks send state per contact for idempotence and retry logic.
 *
 * Related: specs/private-profile-sharing.md FR2, FR3, FR4, FR9
 */

import { Database } from 'sql.js';
import { ProfileSendResult, ProfileSendState, PRIVATE_PROFILE_KIND } from '../../shared/profile-types';
import { NostrKeypair, NostrEvent, npubToHex } from './crypto';
import { RelayPool, PublishResult } from './relay-pool';
import { wrapEvent } from 'nostr-tools/nip59';
import { randomUUID } from 'node:crypto';
import { log } from '../logging';

// ============================================================================
// STUB: sendProfileToContact
// ============================================================================

/**
 * Sends private profile to a single contact via NIP-59 gift wrap
 *
 * CONTRACT:
 *   Inputs:
 *     - profileEvent: NostrEvent with kind PRIVATE_PROFILE_KIND
 *       Constraints: valid signed event from buildPrivateProfileEvent
 *     - profileHash: string, deterministic content hash for idempotence
 *       Constraints: 64-character hex string from calculateProfileHash
 *     - senderKeypair: NostrKeypair of identity sending profile
 *       Constraints: valid keypair matching profileEvent.pubkey
 *     - recipientPubkeyHex: string, hex-encoded pubkey of contact
 *       Constraints: 64-character hex string (valid secp256k1 pubkey)
 *     - relayPool: RelayPool for publishing wrapped event
 *       Constraints: initialized and connected to at least one relay
 *     - database: Database for updating send state
 *       Constraints: contains nostr_profile_send_state table
 *
 *   Outputs:
 *     - result: ProfileSendResult with:
 *       * contactPubkey = recipientPubkeyHex
 *       * success = true if relay publish succeeded
 *       * error = error message if failed (undefined if success)
 *       * eventId = ID of wrapped event if successful
 *       * skipped = true if this profile version already sent to contact
 *
 *   Invariants:
 *     - Profile event is wrapped with NIP-59 before sending (NEVER sent unwrapped)
 *     - Send state is updated in database on success
 *     - If already sent this version to contact, skip send and return skipped=true
 *     - Best-effort: errors are logged but don't throw (return error in result)
 *
 *   Properties:
 *     - Idempotent: sending same profile to same contact multiple times is safe (no-op after first)
 *     - Wrapping: inner event is PRIVATE_PROFILE_KIND, outer is NIP-59 gift wrap
 *     - State tracking: database reflects last successful send per contact
 *
 *   Algorithm:
 *     1. Query database for last sent profile hash to this contact
 *     2. If last_sent_profile_hash equals profileHash, return skipped=true
 *     3. Wrap profileEvent using NIP-59 wrapEvent(profileEvent, senderPrivateKey, recipientPubkey)
 *     4. Publish wrapped event to relay pool
 *     5. If publish succeeds:
 *        a. Update send state: last_sent_profile_event_id, last_sent_profile_hash, last_success_at
 *        b. Return success=true with wrapped event ID
 *     6. If publish fails:
 *        a. Update send state: last_attempt_at, last_error
 *        b. Return success=false with error message
 *
 *   Error Conditions:
 *     - Wrapping fails → log error, return success=false with error
 *     - Publish fails (relay error) → log error, return success=false with error
 *     - Database update fails → log warning but return publish result
 *
 * TODO (pbt-dev): Implement using nostr-tools NIP-59 functions
 *   - Import { wrapEvent } from 'nostr-tools/nip59'
 *   - Use relayPool.publish() to send wrapped event
 *   - Handle PublishResult to determine success
 *   - Update nostr_profile_send_state table with proper timestamps
 *   - Return ProfileSendResult with all fields populated
 */
export async function sendProfileToContact(
  profileEvent: NostrEvent,
  profileHash: string,
  senderKeypair: NostrKeypair,
  recipientPubkeyHex: string,
  relayPool: RelayPool,
  database: Database
): Promise<ProfileSendResult> {
  const now = new Date().toISOString();

  try {
    // Step 1: Query database for last sent profile hash to this contact
    const stmt = database.prepare(
      'SELECT last_sent_profile_hash FROM nostr_profile_send_state WHERE identity_pubkey = ? AND contact_pubkey = ?'
    );
    stmt.bind([senderKeypair.pubkeyHex, recipientPubkeyHex]);
    const hasRow = stmt.step();
    const lastSentHash = hasRow ? (stmt.getAsObject() as { last_sent_profile_hash?: string }).last_sent_profile_hash : null;
    stmt.free();

    // Step 2: If already sent this version, return skipped
    if (lastSentHash === profileHash) {
      log('debug', `Skipping send to ${recipientPubkeyHex}: profile hash ${profileHash} already sent`);
      return {
        contactId: '', // Not available at this level
        contactPubkey: recipientPubkeyHex,
        success: true,
        skipped: true
      };
    }

    // Step 3: Wrap profileEvent using NIP-59
    const wrappedEvent = wrapEvent(
      {
        kind: profileEvent.kind,
        created_at: profileEvent.created_at,
        tags: profileEvent.tags,
        content: profileEvent.content,
        pubkey: profileEvent.pubkey
      },
      senderKeypair.secretKey,
      recipientPubkeyHex
    );

    // Step 4: Publish wrapped event to relay pool
    const publishResults = await relayPool.publish(wrappedEvent as NostrEvent);

    // Determine if publish succeeded (at least one relay accepted)
    const anySuccess = publishResults.some(r => r.success);

    if (anySuccess) {
      // Step 5a: Update send state on success
      const updateStmt = database.prepare(`
        INSERT INTO nostr_profile_send_state (id, identity_pubkey, contact_pubkey, last_sent_profile_event_id, last_sent_profile_hash, last_success_at, last_attempt_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(identity_pubkey, contact_pubkey) DO UPDATE SET
          last_sent_profile_event_id = excluded.last_sent_profile_event_id,
          last_sent_profile_hash = excluded.last_sent_profile_hash,
          last_success_at = excluded.last_success_at,
          last_attempt_at = excluded.last_attempt_at,
          last_error = NULL
      `);
      try {
        updateStmt.run([randomUUID(), senderKeypair.pubkeyHex, recipientPubkeyHex, wrappedEvent.id, profileHash, now, now]);
        updateStmt.free();
      } catch (dbError) {
        log('warn', `Failed to update send state for ${recipientPubkeyHex}: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }

      log('info', `Successfully sent profile to ${recipientPubkeyHex} (${publishResults.filter(r => r.success).length}/${publishResults.length} relays)`);
      return {
        contactId: '',
        contactPubkey: recipientPubkeyHex,
        success: true,
        eventId: wrappedEvent.id
      };
    } else {
      // Step 6: Publish failed - update send state with error
      const errorMessages = publishResults.filter(r => !r.success).map(r => r.message).join('; ');
      const errorStmt = database.prepare(`
        INSERT INTO nostr_profile_send_state (id, identity_pubkey, contact_pubkey, last_attempt_at, last_error)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(identity_pubkey, contact_pubkey) DO UPDATE SET
          last_attempt_at = excluded.last_attempt_at,
          last_error = excluded.last_error
      `);
      try {
        errorStmt.run([randomUUID(), senderKeypair.pubkeyHex, recipientPubkeyHex, now, errorMessages]);
        errorStmt.free();
      } catch (dbError) {
        log('warn', `Failed to update error state for ${recipientPubkeyHex}: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }

      log('error', `Failed to send profile to ${recipientPubkeyHex}: ${errorMessages}`);
      return {
        contactId: '',
        contactPubkey: recipientPubkeyHex,
        success: false,
        error: errorMessages
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', `Error sending profile to ${recipientPubkeyHex}: ${errorMessage}`);

    // Update error state in database
    try {
      const errorStmt = database.prepare(`
        INSERT INTO nostr_profile_send_state (id, identity_pubkey, contact_pubkey, last_attempt_at, last_error)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(identity_pubkey, contact_pubkey) DO UPDATE SET
          last_attempt_at = excluded.last_attempt_at,
          last_error = excluded.last_error
      `);
      errorStmt.run([randomUUID(), senderKeypair.pubkeyHex, recipientPubkeyHex, now, errorMessage]);
      errorStmt.free();
    } catch (dbError) {
      log('warn', `Failed to update error state: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
    }

    return {
      contactId: '',
      contactPubkey: recipientPubkeyHex,
      success: false,
      error: errorMessage
    };
  }
}

// ============================================================================
// STUB: sendProfileToAllContacts
// ============================================================================

/**
 * Sends private profile to all contacts of an identity
 *
 * CONTRACT:
 *   Inputs:
 *     - profileEvent: NostrEvent with kind PRIVATE_PROFILE_KIND
 *       Constraints: valid signed event from buildPrivateProfileEvent
 *     - profileHash: string, deterministic content hash
 *       Constraints: 64-character hex string
 *     - senderKeypair: NostrKeypair of identity
 *       Constraints: valid keypair matching profileEvent.pubkey
 *     - identityId: string, UUID of identity in database
 *       Constraints: exists in nostr_identities table
 *     - relayPool: RelayPool for publishing
 *       Constraints: initialized relay pool
 *     - database: Database for querying contacts and updating state
 *       Constraints: contains nostr_contacts and nostr_profile_send_state tables
 *
 *   Outputs:
 *     - results: array of ProfileSendResult, one per contact
 *       Constraints: results.length equals number of active contacts for identity
 *
 *   Invariants:
 *     - All active (non-deleted) contacts receive send attempt
 *     - Results array contains entry for each contact (success or failure)
 *     - Partial failures are acceptable (best-effort)
 *
 *   Properties:
 *     - Completeness: every active contact gets a result entry
 *     - Independence: one contact's send failure doesn't block others
 *     - Best-effort: errors are collected but don't stop iteration
 *
 *   Algorithm:
 *     1. Query database for all active contacts of identityId (WHERE identity_id = ? AND deleted_at IS NULL)
 *     2. For each contact:
 *        a. Extract contact pubkey (convert npub to hex if needed)
 *        b. Call sendProfileToContact with contact pubkey
 *        c. Collect result
 *     3. Return array of all results
 *
 *   Error Conditions:
 *     - Identity has no contacts → return empty array (not an error)
 *     - Database query fails → throw Error "Failed to query contacts"
 *     - Individual send failures → captured in ProfileSendResult, don't throw
 *
 * TODO (pbt-dev): Implement contact iteration and batch send
 *   - Query nostr_contacts WHERE identity_id = ? AND deleted_at IS NULL
 *   - Use npubToHex from crypto.ts to convert contact npub to hex
 *   - Call sendProfileToContact for each contact
 *   - Collect all results and return as array
 */
export async function sendProfileToAllContacts(
  profileEvent: NostrEvent,
  profileHash: string,
  senderKeypair: NostrKeypair,
  identityId: string,
  relayPool: RelayPool,
  database: Database
): Promise<ProfileSendResult[]> {
  try {
    // Step 1: Query all active contacts for this identity
    const stmt = database.prepare(
      'SELECT id, npub FROM nostr_contacts WHERE identity_id = ? AND deleted_at IS NULL'
    );
    stmt.bind([identityId]);

    const contacts: Array<{ id: string; npub: string }> = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { id: string; npub: string };
      contacts.push(row);
    }
    stmt.free();

    if (contacts.length === 0) {
      log('debug', `No active contacts found for identity ${identityId}`);
      return [];
    }

    log('info', `Sending profile to ${contacts.length} contact(s) for identity ${identityId}`);

    // Step 2: Send profile to each contact
    const results: ProfileSendResult[] = [];
    for (const contact of contacts) {
      try {
        // Convert npub to hex
        const contactPubkeyHex = npubToHex(contact.npub);

        // Send to this contact
        const result = await sendProfileToContact(
          profileEvent,
          profileHash,
          senderKeypair,
          contactPubkeyHex,
          relayPool,
          database
        );

        // Add contact ID to result
        results.push({
          ...result,
          contactId: contact.id
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log('error', `Failed to send profile to contact ${contact.id}: ${errorMessage}`);

        // Add failed result
        results.push({
          contactId: contact.id,
          contactPubkey: '',
          success: false,
          error: errorMessage
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const skippedCount = results.filter(r => r.skipped).length;
    log('info', `Profile send complete: ${successCount} succeeded, ${skippedCount} skipped, ${results.length - successCount - skippedCount} failed`);

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', `Failed to query contacts: ${errorMessage}`);
    throw new Error(`Failed to query contacts: ${errorMessage}`);
  }
}

// ============================================================================
// STUB: getSendState
// ============================================================================

/**
 * Retrieves send state for a specific identity-contact pair
 *
 * CONTRACT:
 *   Inputs:
 *     - identityPubkey: string, hex-encoded pubkey of identity
 *       Constraints: 64-character hex string
 *     - contactPubkey: string, hex-encoded pubkey of contact
 *       Constraints: 64-character hex string
 *     - database: Database to query
 *       Constraints: contains nostr_profile_send_state table
 *
 *   Outputs:
 *     - state: ProfileSendState if record exists, null if not found
 *
 *   Invariants:
 *     - Returns null if no send state exists for this pair
 *     - Returns valid ProfileSendState if record exists
 *
 *   Properties:
 *     - Deterministic: same inputs → same output
 *     - Existence check: null result means never sent to this contact
 *
 *   Algorithm:
 *     1. Query nostr_profile_send_state WHERE identity_pubkey = ? AND contact_pubkey = ?
 *     2. If no row found, return null
 *     3. If row found, parse fields and return ProfileSendState
 *
 *   Error Conditions:
 *     - Database query fails → throw Error "Failed to query send state"
 *
 * TODO (pbt-dev): Implement database query
 *   - SELECT from nostr_profile_send_state with WHERE clause
 *   - Map database row to ProfileSendState type
 *   - Handle nullable fields (last_error, last_attempt_at, etc.)
 */
export function getSendState(
  identityPubkey: string,
  contactPubkey: string,
  database: Database
): ProfileSendState | null {
  try {
    const stmt = database.prepare(
      'SELECT id, identity_pubkey, contact_pubkey, last_sent_profile_event_id, last_sent_profile_hash, last_attempt_at, last_success_at, last_error FROM nostr_profile_send_state WHERE identity_pubkey = ? AND contact_pubkey = ?'
    );
    stmt.bind([identityPubkey, contactPubkey]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject() as {
      id: string;
      identity_pubkey: string;
      contact_pubkey: string;
      last_sent_profile_event_id?: string;
      last_sent_profile_hash?: string;
      last_attempt_at?: string;
      last_success_at?: string;
      last_error?: string;
    };
    stmt.free();

    return {
      id: row.id,
      identityPubkey: row.identity_pubkey,
      contactPubkey: row.contact_pubkey,
      lastSentProfileEventId: row.last_sent_profile_event_id,
      lastSentProfileHash: row.last_sent_profile_hash,
      lastAttemptAt: row.last_attempt_at,
      lastSuccessAt: row.last_success_at,
      lastError: row.last_error
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to query send state: ${errorMessage}`);
  }
}
