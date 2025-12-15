/**
 * Private Profile Sharing Types
 *
 * Type definitions for profile data structures and operations.
 * Supports private (NIP-59 wrapped) and public (kind:0) profiles.
 *
 * Related: specs/private-profile-sharing.md
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Private profile event kind (application-defined)
 *
 * Uses kind 30078 from the parameterized replaceable event range (30000-39999).
 * This kind is application-specific and will not conflict with standard NIPs.
 *
 * Private profile events:
 * - Content structure matches kind:0 metadata (name, about, picture, etc.)
 * - MUST be wrapped with NIP-59 before transmission
 * - NEVER published unwrapped to relays
 */
export const PRIVATE_PROFILE_KIND = 30078;

// ============================================================================
// Profile Source Types
// ============================================================================

/**
 * Profile data source discriminator
 */
export type ProfileSource = 'private_received' | 'public_discovered' | 'private_authored';

// ============================================================================
// Profile Content Structure (kind:0 compatible)
// ============================================================================

/**
 * Profile metadata content matching kind:0 structure
 *
 * All fields are optional per NIP-01 kind:0 specification.
 * Applications should handle missing fields gracefully.
 */
export interface ProfileContent {
  name?: string;           // Display name
  display_name?: string;   // Alternative display name
  about?: string;          // Profile bio/description
  picture?: string;        // Avatar image URL
  banner?: string;         // Header/banner image URL
  website?: string;        // Personal website URL
  nip05?: string;          // NIP-05 identifier (user@domain)
  lud16?: string;          // Lightning address (LNURL)
  lud06?: string;          // Lightning LNURL (deprecated, prefer lud16)
  [key: string]: unknown;  // Allow additional custom fields
}

// ============================================================================
// Profile Data Models
// ============================================================================

/**
 * Base profile record stored in database
 */
export interface ProfileRecord {
  id: string;                  // Unique record ID (UUID)
  ownerPubkey: string;         // Pubkey this profile describes (hex format)
  source: ProfileSource;       // How this profile was obtained
  content: ProfileContent;     // Profile metadata (parsed from content_json)
  eventId?: string;            // Nostr event ID (if applicable)
  validSignature: boolean;     // Whether signature validation passed
  createdAt: string;           // ISO timestamp of record creation
  updatedAt: string;           // ISO timestamp of last update
}

/**
 * Private profile authored by an identity
 *
 * This is the profile that an identity shares with contacts.
 */
export interface PrivateAuthoredProfile extends ProfileRecord {
  source: 'private_authored';
}

/**
 * Private profile received from a contact
 *
 * Delivered via NIP-59 gift wrap, validated signature.
 */
export interface PrivateReceivedProfile extends ProfileRecord {
  source: 'private_received';
}

/**
 * Public profile discovered on relays
 *
 * Standard kind:0 metadata event, read-only.
 */
export interface PublicDiscoveredProfile extends ProfileRecord {
  source: 'public_discovered';
}

// ============================================================================
// Profile Send State
// ============================================================================

/**
 * Tracks which contacts have received which private profile version
 *
 * Persists across contact removal/re-add per FR9.
 */
export interface ProfileSendState {
  id: string;                       // Unique record ID (UUID)
  identityPubkey: string;           // Identity sending the profile (hex)
  contactPubkey: string;            // Contact receiving the profile (hex)
  lastSentProfileEventId?: string;  // Event ID of last sent profile
  lastSentProfileHash?: string;     // Content hash for idempotence
  lastAttemptAt?: string;           // ISO timestamp of last attempt
  lastSuccessAt?: string;           // ISO timestamp of last success
  lastError?: string;               // Error message if last send failed
}

// ============================================================================
// Public Profile Presence
// ============================================================================

/**
 * Tracks whether a pubkey has a public kind:0 profile on configured relays
 *
 * Updated hourly and on app restart per FR6.
 */
export interface PublicProfilePresence {
  id: string;                  // Unique record ID (UUID)
  pubkey: string;              // Pubkey to check (hex format)
  exists: boolean;             // Public profile found on relays?
  lastCheckedAt?: string;      // ISO timestamp of last check
  lastCheckSuccess: boolean;   // Did last check succeed (vs relay error)?
  lastSeenEventId?: string;    // Most recent kind:0 event ID seen
}

// ============================================================================
// Display Name Resolution
// ============================================================================

/**
 * Display name resolution result
 *
 * Implements precedence: alias > private > public > npub fallback
 */
export interface DisplayNameResolution {
  displayName: string;         // Resolved display name to show in UI
  source: 'alias' | 'private' | 'public' | 'npub'; // Where name came from
  profile?: ProfileRecord;     // Underlying profile (if from private/public)
}

// ============================================================================
// Profile Update Requests
// ============================================================================

/**
 * Request to update identity's private profile
 *
 * Triggers send to all contacts per FR4.
 */
export interface UpdatePrivateProfileRequest {
  identityId: string;          // Identity whose profile to update
  content: ProfileContent;     // New profile content (kind:0 shaped)
}

/**
 * Result of profile update operation
 */
export interface UpdatePrivateProfileResult {
  profile: PrivateAuthoredProfile;  // Updated profile record
  sendResults: ProfileSendResult[]; // Per-contact send results
}

/**
 * Result of sending profile to a single contact
 */
export interface ProfileSendResult {
  contactId: string;           // Contact who received (or should have received) profile
  contactPubkey: string;       // Contact pubkey (hex)
  success: boolean;            // Send succeeded?
  error?: string;              // Error message if failed
  eventId?: string;            // Event ID of sent wrapped profile
  skipped?: boolean;           // Skipped because already sent this version?
}
