/**
 * Display Name Resolver
 *
 * Implements display name precedence: alias > private > public > npub fallback.
 * Provides unified resolution across all UI contexts.
 *
 * Related: specs/private-profile-sharing.md FR7
 */

import { Database } from 'sql.js';
import { DisplayNameResolution, ProfileRecord, ProfileContent } from '../../shared/profile-types';
import * as nip19 from 'nostr-tools/nip19';
import { npubToHex } from './crypto';

// ============================================================================
// STUB: resolveDisplayName
// ============================================================================

/**
 * Resolves display name for a pubkey using precedence rules
 *
 * CONTRACT:
 *   Inputs:
 *     - pubkey: string, hex-encoded pubkey to resolve
 *       Constraints: 64-character hex string
 *     - contactAlias: string | null, user-defined alias for this contact
 *       Constraints: if provided, non-empty trimmed string
 *     - database: Database for querying profiles
 *       Constraints: contains nostr_profiles table
 *
 *   Outputs:
 *     - resolution: DisplayNameResolution with:
 *       * displayName = resolved name string
 *       * source = 'alias' | 'private' | 'public' | 'npub'
 *       * profile = ProfileRecord if source is 'private' or 'public' (undefined for alias/npub)
 *
 *   Invariants:
 *     - Precedence order: alias > private > public > npub
 *     - Always returns a valid display name (never null/empty)
 *     - If alias exists and non-empty, source='alias' and displayName=alias
 *     - If no alias but private profile exists, source='private' and displayName from private profile
 *     - If no alias/private but public profile exists, source='public' and displayName from public profile
 *     - If no alias/private/public, source='npub' and displayName=shortened npub
 *
 *   Properties:
 *     - Precedence enforcement: higher priority sources always win
 *     - Fallback guarantee: npub fallback ensures non-empty result
 *     - Profile extraction: private/public profiles use name or display_name field (prefer name, fallback to display_name)
 *
 *   Algorithm:
 *     1. If contactAlias is non-null and non-empty (after trim):
 *        a. Return { displayName: alias, source: 'alias', profile: undefined }
 *     2. Query private profile for pubkey (source='private_received')
 *     3. If private profile found:
 *        a. Extract name from profile.content.name || profile.content.display_name
 *        b. If name exists, return { displayName: name, source: 'private', profile: privateProfile }
 *     4. Query public profile for pubkey (source='public_discovered')
 *     5. If public profile found:
 *        a. Extract name from profile.content.name || profile.content.display_name
 *        b. If name exists, return { displayName: name, source: 'public', profile: publicProfile }
 *     6. Fallback: convert pubkey to npub and shorten
 *        a. Use npubEncode from nostr-tools to create npub
 *        b. Shorten to "npub1...xyz" format (first 8 + last 4 chars)
 *        c. Return { displayName: shortenedNpub, source: 'npub', profile: undefined }
 *
 *   Error Conditions:
 *     - Database query fails → log warning, continue to next precedence level
 *     - Profile content missing name fields → continue to next precedence level
 *     - If all precedence levels fail → guaranteed npub fallback (no error)
 *
 * TODO (pbt-dev): Implement precedence logic
 *   - Query profiles using getProfileForPubkey from profile-receiver.ts
 *   - Extract name from profile.content (handle missing fields gracefully)
 *   - Use nip19.npubEncode and string slicing for npub fallback
 *   - Return DisplayNameResolution with all fields
 */
export function resolveDisplayName(
  pubkey: string,
  contactAlias: string | null,
  database: Database
): DisplayNameResolution {
  // 1. Check for alias (highest precedence)
  if (contactAlias !== null && contactAlias.trim() !== '') {
    return {
      displayName: contactAlias.trim(),
      source: 'alias',
      profile: undefined
    };
  }

  // 2. Query private profile (source='private_received')
  try {
    const privateProfileQuery = database.exec(`
      SELECT id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at
      FROM nostr_profiles
      WHERE owner_pubkey = ? AND source = 'private_received'
      ORDER BY updated_at DESC
      LIMIT 1
    `, [pubkey]);

    if (privateProfileQuery.length > 0 && privateProfileQuery[0].values.length > 0) {
      const row = privateProfileQuery[0].values[0];
      const contentJson = row[3] as string;
      const content: ProfileContent = JSON.parse(contentJson);
      const name = extractNameFromProfile(content);

      if (name !== null) {
        const privateProfile: ProfileRecord = {
          id: row[0] as string,
          ownerPubkey: row[1] as string,
          source: row[2] as 'private_received',
          content,
          eventId: row[4] as string | undefined,
          validSignature: Boolean(row[5]),
          createdAt: row[6] as string,
          updatedAt: row[7] as string
        };

        return {
          displayName: name,
          source: 'private',
          profile: privateProfile
        };
      }
    }
  } catch (error) {
    console.warn(`Failed to query private profile for ${pubkey}:`, error instanceof Error ? error.message : 'unknown error');
  }

  // 3. Query public profile (source='public_discovered')
  try {
    const publicProfileQuery = database.exec(`
      SELECT id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at
      FROM nostr_profiles
      WHERE owner_pubkey = ? AND source = 'public_discovered'
      ORDER BY updated_at DESC
      LIMIT 1
    `, [pubkey]);

    if (publicProfileQuery.length > 0 && publicProfileQuery[0].values.length > 0) {
      const row = publicProfileQuery[0].values[0];
      const contentJson = row[3] as string;
      const content: ProfileContent = JSON.parse(contentJson);
      const name = extractNameFromProfile(content);

      if (name !== null) {
        const publicProfile: ProfileRecord = {
          id: row[0] as string,
          ownerPubkey: row[1] as string,
          source: row[2] as 'public_discovered',
          content,
          eventId: row[4] as string | undefined,
          validSignature: Boolean(row[5]),
          createdAt: row[6] as string,
          updatedAt: row[7] as string
        };

        return {
          displayName: name,
          source: 'public',
          profile: publicProfile
        };
      }
    }
  } catch (error) {
    console.warn(`Failed to query public profile for ${pubkey}:`, error instanceof Error ? error.message : 'unknown error');
  }

  // 4. Fallback to npub (shortened)
  const npub = nip19.npubEncode(pubkey);
  const shortened = `${npub.substring(0, 8)}...${npub.substring(npub.length - 4)}`;

  return {
    displayName: shortened,
    source: 'npub',
    profile: undefined
  };
}

// ============================================================================
// STUB: resolveDisplayNameForContact
// ============================================================================

/**
 * Convenience function to resolve display name for a contact record
 *
 * CONTRACT:
 *   Inputs:
 *     - contactId: string, UUID of contact
 *       Constraints: exists in nostr_contacts table
 *     - database: Database for querying contact and profiles
 *       Constraints: contains nostr_contacts and nostr_profiles tables
 *
 *   Outputs:
 *     - resolution: DisplayNameResolution for this contact
 *
 *   Invariants:
 *     - Queries contact record to get npub and alias
 *     - Delegates to resolveDisplayName with contact's pubkey and alias
 *
 *   Properties:
 *     - Convenience wrapper: single contactId lookup
 *     - Same precedence as resolveDisplayName
 *
 *   Algorithm:
 *     1. Query nostr_contacts WHERE id = contactId
 *     2. If not found, throw Error "Contact not found"
 *     3. Extract contact.npub and contact.alias
 *     4. Convert npub to hex pubkey (use npubToHex from crypto.ts)
 *     5. Call resolveDisplayName(pubkey, alias, database)
 *     6. Return resolution
 *
 *   Error Conditions:
 *     - Contact not found → throw Error "Contact not found"
 *     - Database query fails → throw Error "Failed to query contact"
 *
 * TODO (pbt-dev): Implement contact lookup and delegation
 *   - Query nostr_contacts table
 *   - Convert npub to hex pubkey
 *   - Delegate to resolveDisplayName
 */
export function resolveDisplayNameForContact(
  contactId: string,
  database: Database
): DisplayNameResolution {
  // Query contact record
  const contactQuery = database.exec(`
    SELECT npub, alias
    FROM nostr_contacts
    WHERE id = ?
  `, [contactId]);

  if (contactQuery.length === 0 || contactQuery[0].values.length === 0) {
    throw new Error('Contact not found');
  }

  const row = contactQuery[0].values[0];
  const npub = row[0] as string;
  const alias = row[1] as string | null;

  // Convert npub to hex pubkey
  let pubkey: string;
  try {
    pubkey = npubToHex(npub);
  } catch (error) {
    throw new Error(`Failed to query contact: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  // Delegate to resolveDisplayName
  return resolveDisplayName(pubkey, alias, database);
}

// ============================================================================
// STUB: resolveDisplayNameForIdentity
// ============================================================================

/**
 * Resolves display name for an identity (own profile)
 *
 * CONTRACT:
 *   Inputs:
 *     - identityId: string, UUID of identity
 *       Constraints: exists in nostr_identities table
 *     - database: Database for querying identity and profiles
 *       Constraints: contains nostr_identities and nostr_profiles tables
 *
 *   Outputs:
 *     - resolution: DisplayNameResolution for this identity
 *
 *   Invariants:
 *     - Uses identity.label as "alias" (highest precedence)
 *     - If identity.label empty, falls back to private_authored profile
 *     - If no private_authored, falls back to public_discovered profile
 *     - Final fallback is npub
 *
 *   Properties:
 *     - Identity label takes precedence (same as contact alias)
 *     - Private authored profile is identity's own profile
 *     - Same precedence structure as contacts
 *
 *   Algorithm:
 *     1. Query nostr_identities WHERE id = identityId
 *     2. If not found, throw Error "Identity not found"
 *     3. Extract identity.npub and identity.label
 *     4. Convert npub to hex pubkey
 *     5. Call resolveDisplayName(pubkey, label, database)
 *        Note: For identities, check private_authored source instead of private_received
 *     6. Return resolution
 *
 *   Error Conditions:
 *     - Identity not found → throw Error "Identity not found"
 *     - Database query fails → throw Error "Failed to query identity"
 *
 * TODO (pbt-dev): Implement identity lookup with source adjustment
 *   - Query nostr_identities table
 *   - Convert npub to hex
 *   - Adjust resolveDisplayName to check private_authored for identities
 *   - Consider identity.label as alias equivalent
 */
export function resolveDisplayNameForIdentity(
  identityId: string,
  database: Database
): DisplayNameResolution {
  // Query identity record
  const identityQuery = database.exec(`
    SELECT npub, label
    FROM nostr_identities
    WHERE id = ?
  `, [identityId]);

  if (identityQuery.length === 0 || identityQuery[0].values.length === 0) {
    throw new Error('Identity not found');
  }

  const row = identityQuery[0].values[0];
  const npub = row[0] as string;
  const label = row[1] as string | null;

  // Convert npub to hex pubkey
  let pubkey: string;
  try {
    pubkey = npubToHex(npub);
  } catch (error) {
    throw new Error(`Failed to query identity: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  // Check for label (acts as alias, highest precedence)
  if (label !== null && label.trim() !== '') {
    return {
      displayName: label.trim(),
      source: 'alias',
      profile: undefined
    };
  }

  // Query private_authored profile (identity's own profile)
  try {
    const privateAuthoredQuery = database.exec(`
      SELECT id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at
      FROM nostr_profiles
      WHERE owner_pubkey = ? AND source = 'private_authored'
      ORDER BY updated_at DESC
      LIMIT 1
    `, [pubkey]);

    if (privateAuthoredQuery.length > 0 && privateAuthoredQuery[0].values.length > 0) {
      const profileRow = privateAuthoredQuery[0].values[0];
      const contentJson = profileRow[3] as string;
      const content: ProfileContent = JSON.parse(contentJson);
      const name = extractNameFromProfile(content);

      if (name !== null) {
        const privateProfile: ProfileRecord = {
          id: profileRow[0] as string,
          ownerPubkey: profileRow[1] as string,
          source: profileRow[2] as 'private_authored',
          content,
          eventId: profileRow[4] as string | undefined,
          validSignature: Boolean(profileRow[5]),
          createdAt: profileRow[6] as string,
          updatedAt: profileRow[7] as string
        };

        return {
          displayName: name,
          source: 'private',
          profile: privateProfile
        };
      }
    }
  } catch (error) {
    console.warn(`Failed to query private authored profile for ${pubkey}:`, error instanceof Error ? error.message : 'unknown error');
  }

  // Query public profile (source='public_discovered')
  try {
    const publicProfileQuery = database.exec(`
      SELECT id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at
      FROM nostr_profiles
      WHERE owner_pubkey = ? AND source = 'public_discovered'
      ORDER BY updated_at DESC
      LIMIT 1
    `, [pubkey]);

    if (publicProfileQuery.length > 0 && publicProfileQuery[0].values.length > 0) {
      const profileRow = publicProfileQuery[0].values[0];
      const contentJson = profileRow[3] as string;
      const content: ProfileContent = JSON.parse(contentJson);
      const name = extractNameFromProfile(content);

      if (name !== null) {
        const publicProfile: ProfileRecord = {
          id: profileRow[0] as string,
          ownerPubkey: profileRow[1] as string,
          source: profileRow[2] as 'public_discovered',
          content,
          eventId: profileRow[4] as string | undefined,
          validSignature: Boolean(profileRow[5]),
          createdAt: profileRow[6] as string,
          updatedAt: profileRow[7] as string
        };

        return {
          displayName: name,
          source: 'public',
          profile: publicProfile
        };
      }
    }
  } catch (error) {
    console.warn(`Failed to query public profile for ${pubkey}:`, error instanceof Error ? error.message : 'unknown error');
  }

  // Fallback to npub (shortened)
  const npubEncoded = nip19.npubEncode(pubkey);
  const shortened = `${npubEncoded.substring(0, 8)}...${npubEncoded.substring(npubEncoded.length - 4)}`;

  return {
    displayName: shortened,
    source: 'npub',
    profile: undefined
  };
}

// ============================================================================
// STUB: extractNameFromProfile
// ============================================================================

/**
 * Extracts display name from profile content with fallback logic
 *
 * CONTRACT:
 *   Inputs:
 *     - content: ProfileContent from profile record
 *       Constraints: object with optional name, display_name fields
 *
 *   Outputs:
 *     - name: string if name or display_name exists, null if both missing
 *
 *   Invariants:
 *     - Prefers content.name over content.display_name
 *     - Returns null if both fields are missing or empty
 *     - Trims whitespace from result
 *
 *   Properties:
 *     - Priority: name > display_name
 *     - Non-empty guarantee: returns null instead of empty string
 *
 *   Algorithm:
 *     1. If content.name exists and non-empty (after trim), return trimmed name
 *     2. Else if content.display_name exists and non-empty (after trim), return trimmed display_name
 *     3. Else return null
 *
 *   Error Conditions:
 *     - None (graceful handling of missing fields)
 *
 * TODO (pbt-dev): Implement field extraction with fallback
 *   - Check content.name first
 *   - Fallback to content.display_name
 *   - Trim and validate non-empty
 */
export function extractNameFromProfile(
  content: { name?: string; display_name?: string; [key: string]: unknown }
): string | null {
  if (content.name && content.name.trim() !== '') {
    return content.name.trim();
  }

  if (content.display_name && content.display_name.trim() !== '') {
    return content.display_name.trim();
  }

  return null;
}
