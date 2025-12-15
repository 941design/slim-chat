/**
 * Private Profile Event Builder
 *
 * Creates and validates private profile events (kind 30078).
 * These events are NEVER published unwrapped - always transmitted via NIP-59 gift wrap.
 *
 * Related: specs/private-profile-sharing.md FR1, FR2
 */

import { ProfileContent, PRIVATE_PROFILE_KIND } from '../../shared/profile-types';
import { NostrKeypair, NostrEvent } from './crypto';
import { finalizeEvent } from 'nostr-tools/pure';
import { createHash } from 'crypto';

// ============================================================================
// STUB: buildPrivateProfileEvent
// ============================================================================

/**
 * Creates a signed private profile event from profile content
 *
 * CONTRACT:
 *   Inputs:
 *     - content: ProfileContent object containing kind:0-shaped fields
 *       Example: { name: "Alice", about: "Developer", picture: "https://..." }
 *       Constraints: at least one field must be present, all fields are optional strings
 *     - keypair: NostrKeypair with secretKey for signing
 *       Constraints: valid secp256k1 keypair with 32-byte secretKey
 *
 *   Outputs:
 *     - event: NostrEvent with:
 *       * kind = PRIVATE_PROFILE_KIND (30078)
 *       * content = JSON stringified ProfileContent
 *       * pubkey = hex-encoded public key from keypair
 *       * created_at = current Unix timestamp (seconds)
 *       * tags = empty array (no tags needed for private profile)
 *       * id = 32-byte hex-encoded SHA-256 hash of serialized event
 *       * sig = 64-byte hex-encoded Schnorr signature
 *
 *   Invariants:
 *     - Event kind is always PRIVATE_PROFILE_KIND (30078)
 *     - Content is valid JSON that parses back to ProfileContent
 *     - Event ID is deterministic from event fields (NIP-01 serialization)
 *     - Signature is valid for (id, pubkey) pair
 *     - Event is fully signed and ready for NIP-59 wrapping
 *
 *   Properties:
 *     - Deterministic ID: same content + timestamp + pubkey → same event ID
 *     - Valid signature: verifyEvent(event) returns true
 *     - Round-trip content: JSON.parse(event.content) equals input content (modulo key order)
 *     - Never unwrapped: event MUST NOT be published directly to relays
 *
 *   Algorithm:
 *     1. Validate content has at least one field
 *     2. Serialize content to canonical JSON string
 *     3. Create unsigned event structure with kind 30078, empty tags, current timestamp
 *     4. Calculate event ID via NIP-01 serialization and SHA-256
 *     5. Sign event with secretKey to produce Schnorr signature
 *     6. Return complete NostrEvent with id, sig, and all fields
 *
 *   Error Conditions:
 *     - Empty content object → throw Error "Profile content cannot be empty"
 *     - Invalid keypair (wrong secretKey length) → throw Error "Invalid keypair"
 *     - JSON serialization failure → throw Error "Failed to serialize content"
 *
 * TODO (pbt-dev): Implement this function using nostr-tools
 *   - Use finalizeEvent from nostr-tools/pure to sign event
 *   - Ensure content is serialized with consistent key ordering (use JSON.stringify)
 *   - Use current time via Math.floor(Date.now() / 1000)
 *   - Return NostrEvent matching crypto.ts NostrEvent interface
 */
export function buildPrivateProfileEvent(
  content: ProfileContent,
  keypair: NostrKeypair
): NostrEvent {
  if (!content || typeof content !== 'object') {
    throw new Error('Profile content cannot be empty');
  }

  const keys = Object.keys(content).filter(key => content[key] !== undefined);
  if (keys.length === 0) {
    throw new Error('Profile content cannot be empty');
  }

  if (keypair.secretKey.length !== 32) {
    throw new Error('Invalid keypair');
  }

  let contentJson: string;
  try {
    contentJson = JSON.stringify(content);
  } catch {
    throw new Error('Failed to serialize content');
  }

  const eventTemplate = {
    kind: PRIVATE_PROFILE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: contentJson
  };

  return finalizeEvent(eventTemplate, keypair.secretKey) as NostrEvent;
}

// ============================================================================
// STUB: calculateProfileHash
// ============================================================================

/**
 * Calculates a deterministic hash of profile content for idempotence checking
 *
 * CONTRACT:
 *   Inputs:
 *     - content: ProfileContent object
 *       Constraints: non-empty object with at least one field
 *
 *   Outputs:
 *     - hash: string, 64-character hex-encoded SHA-256 hash
 *
 *   Invariants:
 *     - Hash is deterministic from content (same content → same hash)
 *     - Hash is independent of key ordering in content object
 *     - Hash output is always 64 hex characters
 *
 *   Properties:
 *     - Deterministic: calculateProfileHash(content) always returns same hash
 *     - Order-independent: calculateProfileHash({a: 1, b: 2}) equals calculateProfileHash({b: 2, a: 1})
 *     - Collision-resistant: different content → different hash (SHA-256 property)
 *
 *   Algorithm:
 *     1. Sort content object keys alphabetically
 *     2. Create deterministic JSON string with sorted keys
 *     3. Calculate SHA-256 hash of UTF-8 encoded JSON string
 *     4. Return hex-encoded hash
 *
 *   Error Conditions:
 *     - Empty content → throw Error "Cannot hash empty content"
 *
 * TODO (pbt-dev): Implement using Node.js crypto module
 *   - Use JSON.stringify with sorted keys (Object.keys(content).sort())
 *   - Hash with crypto.createHash('sha256')
 *   - Return hex digest
 */
export function calculateProfileHash(content: ProfileContent): string {
  if (!content || typeof content !== 'object') {
    throw new Error('Cannot hash empty content');
  }

  const keys = Object.keys(content).filter(key => content[key] !== undefined);
  if (keys.length === 0) {
    throw new Error('Cannot hash empty content');
  }

  const sortedKeys = keys.sort();
  const sortedContent: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    sortedContent[key] = content[key];
  }

  const jsonString = JSON.stringify(sortedContent);
  const hash = createHash('sha256').update(jsonString, 'utf8').digest('hex');

  return hash;
}

// ============================================================================
// STUB: validateProfileContent
// ============================================================================

/**
 * Validates that profile content conforms to kind:0 structure
 *
 * CONTRACT:
 *   Inputs:
 *     - content: unknown value to validate
 *
 *   Outputs:
 *     - result: ProfileContent if valid (type assertion)
 *       Throws if invalid
 *
 *   Invariants:
 *     - Valid content is a non-null object
 *     - Valid content has at least one recognized field (name, about, picture, etc.)
 *     - All field values are strings (or undefined/absent)
 *
 *   Properties:
 *     - Type guard: if validateProfileContent succeeds, content is ProfileContent
 *     - Non-empty: at least one field must be defined
 *     - String values: all defined fields must be strings
 *
 *   Algorithm:
 *     1. Check content is object and not null
 *     2. Check at least one known field exists (name, about, picture, display_name, etc.)
 *     3. Check all field values are strings or undefined
 *     4. Return content as ProfileContent type
 *
 *   Error Conditions:
 *     - content is null/undefined → throw Error "Profile content is required"
 *     - content is not an object → throw Error "Profile content must be an object"
 *     - content is empty object → throw Error "Profile content cannot be empty"
 *     - content has non-string field values → throw Error "Profile fields must be strings"
 *
 * TODO (pbt-dev): Implement validation logic
 *   - Check for known fields: name, display_name, about, picture, banner, website, nip05, lud16, lud06
 *   - Allow additional custom fields (per ProfileContent index signature)
 *   - Ensure type safety for callers
 */
export function validateProfileContent(content: unknown): ProfileContent {
  if (content === null || content === undefined) {
    throw new Error('Profile content is required');
  }

  if (typeof content !== 'object' || Array.isArray(content)) {
    throw new Error('Profile content must be an object');
  }

  const knownFields = [
    'name', 'display_name', 'about', 'picture', 'banner',
    'website', 'nip05', 'lud16', 'lud06'
  ];

  const obj = content as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    throw new Error('Profile content cannot be empty');
  }

  const hasKnownField = keys.some(key => knownFields.includes(key));
  const hasDefinedField = keys.some(key => obj[key] !== undefined);

  if (!hasDefinedField) {
    throw new Error('Profile content cannot be empty');
  }

  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && typeof value !== 'string') {
      throw new Error('Profile fields must be strings');
    }
  }

  return content as ProfileContent;
}
