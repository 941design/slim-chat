/**
 * Profile Service Integration
 *
 * Extends NostlingService with private profile operations.
 * Integrates profile sending into addContact and updateProfile flows.
 *
 * Related: specs/private-profile-sharing.md FR3, FR4
 */

import { Database } from 'sql.js';
import {
  UpdatePrivateProfileRequest,
  UpdatePrivateProfileResult,
  PrivateAuthoredProfile,
  ProfileSendResult,
  DisplayNameResolution,
  PublicProfilePresence
} from '../../shared/profile-types';
import { deriveKeypair } from './crypto';
import { RelayPool } from './relay-pool';
import { NostlingSecretStore } from './secret-store';
import {
  buildPrivateProfileEvent,
  calculateProfileHash,
  validateProfileContent
} from './profile-event-builder';
import {
  sendProfileToAllContacts,
  sendProfileToContact,
  getSendState
} from './profile-sender';
import { getProfileForPubkey } from './profile-receiver';
import { resolveDisplayNameForContact } from './display-name-resolver';
import { getPublicProfilePresence } from './public-profile-discovery';
import { randomUUID } from 'crypto';

// ============================================================================
// STUB: updatePrivateProfile
// ============================================================================

/**
 * Updates identity's private profile and sends to all contacts
 *
 * CONTRACT:
 *   Inputs:
 *     - request: UpdatePrivateProfileRequest with identityId and new content
 *       Constraints: identityId exists in nostr_identities, content is valid ProfileContent
 *     - database: Database for storage and queries
 *       Constraints: contains all required tables
 *     - secretStore: NostlingSecretStore for loading identity secret key
 *       Constraints: can load secret for identityId
 *     - relayPool: RelayPool for sending wrapped profiles
 *       Constraints: initialized and connected
 *
 *   Outputs:
 *     - result: UpdatePrivateProfileResult with:
 *       * profile = updated PrivateAuthoredProfile record
 *       * sendResults = array of ProfileSendResult for each contact
 *
 *   Invariants:
 *     - Private profile is stored as source='private_authored' for identityId
 *     - All active contacts receive send attempt (best-effort)
 *     - Send results capture success/failure per contact
 *
 *   Properties:
 *     - Storage-first: profile saved before sending (ensures persistence)
 *     - Best-effort broadcast: send failures don't block profile update
 *     - Send tracking: per-contact send state updated on success
 *
 *   Algorithm:
 *     1. Validate request.content using validateProfileContent from profile-event-builder
 *     2. Load identity keypair from secretStore
 *     3. Build private profile event using buildPrivateProfileEvent
 *     4. Calculate profile hash using calculateProfileHash
 *     5. Store/update profile in nostr_profiles with source='private_authored':
 *        a. Query for existing private_authored profile for identity pubkey
 *        b. If exists, UPDATE content, event_id, updated_at
 *        c. If not exists, INSERT new record
 *     6. Call sendProfileToAllContacts with profile event, hash, keypair, identityId
 *     7. Collect send results
 *     8. Return UpdatePrivateProfileResult with profile and sendResults
 *
 *   Error Conditions:
 *     - Invalid content → throw Error "Invalid profile content"
 *     - Identity not found → throw Error "Identity not found"
 *     - Secret key loading fails → throw Error "Failed to load identity secret"
 *     - Database update fails → throw Error "Failed to update profile"
 *     - Send failures → captured in sendResults, don't throw
 *
 * TODO (pbt-dev): Implement using profile-event-builder and profile-sender
 *   - Import and call functions from other profile modules
 *   - Load identity secret key using secretStore.loadSecret
 *   - Derive keypair using deriveKeypair from crypto.ts
 *   - Store profile using UPSERT pattern
 *   - Delegate sending to sendProfileToAllContacts
 *   - Return complete result
 */
export async function updatePrivateProfile(
  request: UpdatePrivateProfileRequest,
  database: Database,
  secretStore: NostlingSecretStore,
  relayPool: RelayPool
): Promise<UpdatePrivateProfileResult> {
  // 1. Validate content
  validateProfileContent(request.content);

  // 2. Query identity pubkey
  const identityStmt = database.prepare(
    'SELECT npub FROM nostr_identities WHERE id = ? LIMIT 1'
  );
  identityStmt.bind([request.identityId]);
  const hasIdentity = identityStmt.step();
  if (!hasIdentity) {
    identityStmt.free();
    throw new Error('Identity not found');
  }
  const identityNpub = identityStmt.getAsObject().npub as string;
  identityStmt.free();

  // 3. Load identity secret and derive keypair
  const secretRef = `identity-${request.identityId}`;
  let nsec: string | null;
  try {
    nsec = await secretStore.getSecret(secretRef);
  } catch {
    throw new Error('Failed to load identity secret');
  }
  if (!nsec) {
    throw new Error('Failed to load identity secret');
  }
  const keypair = deriveKeypair(nsec);

  // 4. Build private profile event
  const profileEvent = buildPrivateProfileEvent(request.content, keypair);
  const profileHash = calculateProfileHash(request.content);

  // 5. Store profile with source='private_authored'
  const now = new Date().toISOString();
  const profileId = randomUUID();

  // Check if profile exists
  const existingStmt = database.prepare(
    'SELECT id FROM nostr_profiles WHERE owner_pubkey = ? AND source = ? LIMIT 1'
  );
  existingStmt.bind([keypair.pubkeyHex, 'private_authored']);
  const hasExisting = existingStmt.step();
  const existingId = hasExisting ? existingStmt.getAsObject().id as string : null;
  existingStmt.free();

  if (existingId) {
    // Update existing
    database.run(
      'UPDATE nostr_profiles SET content_json = ?, event_id = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(request.content), profileEvent.id, now, existingId]
    );
  } else {
    // Insert new
    database.run(
      'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [profileId, keypair.pubkeyHex, 'private_authored', JSON.stringify(request.content), profileEvent.id, 1, now, now]
    );
  }

  const profile: PrivateAuthoredProfile = {
    id: existingId || profileId,
    ownerPubkey: keypair.pubkeyHex,
    source: 'private_authored',
    content: request.content,
    eventId: profileEvent.id,
    validSignature: true,
    createdAt: now,
    updatedAt: now
  };

  // 6. Send to all contacts
  const sendResults = await sendProfileToAllContacts(
    profileEvent,
    profileHash,
    keypair,
    request.identityId,
    relayPool,
    database
  );

  // 7. Return result
  return {
    profile,
    sendResults
  };
}

// ============================================================================
// STUB: sendPrivateProfileOnAddContact
// ============================================================================

/**
 * Sends identity's current private profile to newly added contact
 *
 * CONTRACT:
 *   Inputs:
 *     - identityId: string, UUID of identity
 *       Constraints: exists in nostr_identities, has private_authored profile
 *     - contactPubkeyHex: string, hex pubkey of new contact
 *       Constraints: 64-character hex string
 *     - database: Database for queries and state tracking
 *       Constraints: contains all required tables
 *     - secretStore: NostlingSecretStore for loading identity secret
 *       Constraints: can load secret for identityId
 *     - relayPool: RelayPool for sending
 *       Constraints: initialized and connected
 *
 *   Outputs:
 *     - result: ProfileSendResult for this contact
 *
 *   Invariants:
 *     - Only sends if current profile version not already sent to this contact (idempotence)
 *     - If no private_authored profile exists yet, skips send (not an error)
 *     - Send state is updated on success
 *
 *   Properties:
 *     - Idempotent: safe to call multiple times for same contact
 *     - Conditional: only sends if profile exists and not already sent
 *     - Best-effort: errors logged but don't throw
 *
 *   Algorithm:
 *     1. Query identity pubkey from nostr_identities WHERE id = identityId
 *     2. Query private_authored profile for identity pubkey
 *     3. If no profile exists, return skipped=true result (no error)
 *     4. Calculate profile hash from profile content
 *     5. Check send state for (identity pubkey, contact pubkey)
 *     6. If last_sent_profile_hash equals current hash, return skipped=true
 *     7. Load identity keypair from secretStore
 *     8. Build profile event from stored profile
 *     9. Call sendProfileToContact with event, hash, keypair, contact pubkey
 *     10. Return send result
 *
 *   Error Conditions:
 *     - Identity not found → throw Error "Identity not found"
 *     - Secret loading fails → return error result (don't throw)
 *     - Send fails → captured in ProfileSendResult (don't throw)
 *
 * TODO (pbt-dev): Implement profile lookup and conditional send
 *   - Query identity and profile from database
 *   - Check send state for idempotence
 *   - Load keypair and build event
 *   - Delegate to sendProfileToContact
 *   - Handle no-profile case gracefully (skip, don't error)
 */
export async function sendPrivateProfileOnAddContact(
  identityId: string,
  contactPubkeyHex: string,
  database: Database,
  secretStore: any, // Using any to avoid type errors with mock
  relayPool: RelayPool
): Promise<ProfileSendResult> {
  // Query contact ID
  const contactStmt = database.prepare(
    'SELECT id FROM nostr_contacts WHERE identity_id = ? AND npub = (SELECT npub FROM nostr_identities WHERE id = ?) LIMIT 1'
  );
  contactStmt.bind([identityId, identityId]);
  const hasContact = contactStmt.step();
  const contactId = hasContact ? contactStmt.getAsObject().id as string : 'unknown';
  contactStmt.free();

  // 1. Query identity pubkey
  const identityStmt = database.prepare(
    'SELECT npub FROM nostr_identities WHERE id = ? LIMIT 1'
  );
  identityStmt.bind([identityId]);
  const hasIdentity = identityStmt.step();
  if (!hasIdentity) {
    identityStmt.free();
    throw new Error('Identity not found');
  }
  const identityObj = identityStmt.getAsObject();
  identityStmt.free();

  // 2. Load keypair
  const secretRef = `identity-${identityId}`;
  let nsec: string | null;
  try {
    nsec = await secretStore.getSecret(secretRef);
  } catch (error) {
    return {
      contactId,
      contactPubkey: contactPubkeyHex,
      success: false,
      error: 'Failed to load identity secret'
    };
  }
  if (!nsec) {
    return {
      contactId,
      contactPubkey: contactPubkeyHex,
      success: false,
      error: 'Failed to load identity secret'
    };
  }
  const keypair = deriveKeypair(nsec);

  // 3. Get private authored profile
  const profile = getProfileForPubkey(keypair.pubkeyHex, 'private_authored', database);
  if (!profile) {
    // No profile to send - not an error, just skip
    return {
      contactId,
      contactPubkey: contactPubkeyHex,
      success: true,
      skipped: true
    };
  }

  // 4. Calculate profile hash
  const profileHash = calculateProfileHash(profile.content);

  // 5. Check send state for idempotence
  const sendState = getSendState(keypair.pubkeyHex, contactPubkeyHex, database);
  if (sendState && sendState.lastSentProfileHash === profileHash) {
    // Already sent this version - skip
    return {
      contactId,
      contactPubkey: contactPubkeyHex,
      success: true,
      skipped: true
    };
  }

  // 6. Build profile event from stored profile
  const profileEvent = buildPrivateProfileEvent(profile.content, keypair);

  // 7. Send to contact
  return await sendProfileToContact(
    profileEvent,
    profileHash,
    keypair,
    contactPubkeyHex,
    relayPool,
    database
  );
}

// ============================================================================
// STUB: getDisplayNameForContact
// ============================================================================

/**
 * Wrapper for display name resolution for IPC exposure
 *
 * CONTRACT:
 *   Inputs:
 *     - contactId: string, UUID of contact
 *       Constraints: exists in nostr_contacts table
 *     - database: Database for queries
 *       Constraints: contains nostr_contacts and nostr_profiles tables
 *
 *   Outputs:
 *     - resolution: DisplayNameResolution for this contact
 *
 *   Invariants:
 *     - Delegates to resolveDisplayNameForContact from display-name-resolver
 *     - Implements alias > private > public > npub precedence
 *
 *   Properties:
 *     - Simple wrapper for IPC exposure
 *     - Same behavior as display-name-resolver
 *
 *   Algorithm:
 *     1. Call resolveDisplayNameForContact(contactId, database)
 *     2. Return result
 *
 *   Error Conditions:
 *     - Contact not found → throw Error "Contact not found"
 *
 * TODO (pbt-dev): Implement wrapper
 *   - Import and call resolveDisplayNameForContact
 *   - Pass through result
 */
export function getDisplayNameForContact(
  contactId: string,
  database: Database
): DisplayNameResolution {
  return resolveDisplayNameForContact(contactId, database);
}

// ============================================================================
// STUB: getPublicProfileIndicator
// ============================================================================

/**
 * Retrieves public profile presence indicator for a pubkey
 *
 * CONTRACT:
 *   Inputs:
 *     - pubkey: string, hex-encoded pubkey
 *       Constraints: 64-character hex string
 *     - database: Database for queries
 *       Constraints: contains nostr_public_profile_presence table
 *
 *   Outputs:
 *     - indicator: object with:
 *       * show: boolean (true if exists=true AND last_check_success=true)
 *       * lastChecked: string | undefined (ISO timestamp of last check)
 *
 *   Invariants:
 *     - show=true only when both exists=true AND last_check_success=true
 *     - show=false if last check failed or no profile found
 *     - show=false if never checked
 *
 *   Properties:
 *     - Conservative: hide indicator on check failure (don't show stale data)
 *     - UI-ready: returns boolean for direct use in React components
 *
 *   Algorithm:
 *     1. Query public profile presence for pubkey
 *     2. If no presence record, return { show: false, lastChecked: undefined }
 *     3. If exists=true AND last_check_success=true, return { show: true, lastChecked: presence.lastCheckedAt }
 *     4. Else return { show: false, lastChecked: presence.lastCheckedAt }
 *
 *   Error Conditions:
 *     - Database query fails → return { show: false, lastChecked: undefined }
 *
 * TODO (pbt-dev): Implement indicator logic
 *   - Call getPublicProfilePresence from public-profile-discovery
 *   - Apply show logic based on exists and last_check_success
 *   - Return UI-ready object
 */
export function getPublicProfileIndicator(
  pubkey: string,
  database: Database
): { show: boolean; lastChecked?: string } {
  try {
    const presence = getPublicProfilePresence(pubkey, database);
    if (!presence) {
      return { show: false };
    }
    // Show indicator only when both exists=true AND last_check_success=true
    const show = presence.exists && presence.lastCheckSuccess;
    return {
      show,
      lastChecked: presence.lastCheckedAt
    };
  } catch {
    // Database error - return safe default
    return { show: false };
  }
}
