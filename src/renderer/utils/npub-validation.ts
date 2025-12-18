/**
 * npub Validation and Extraction Utilities (Renderer-side)
 *
 * This is a duplicate of the validation logic from src/main/nostling/crypto.ts
 * for use in the renderer process without IPC overhead.
 *
 * CONTRACT:
 *   Inputs:
 *     - npub: string, any string value to validate
 *
 *   Outputs:
 *     - boolean: true if valid npub, false otherwise
 *
 *   Invariants:
 *     - Same validation rules as main process crypto.isValidNpub()
 *     - No side effects (pure function)
 *
 *   Properties:
 *     - Deterministic: same input always produces same output
 *     - Conservative: invalid inputs return false, never throw
 *
 *   Validation Rules:
 *     1. Must start with "npub1"
 *     2. Must be valid bech32 encoding
 *     3. Decoded type must be 'npub'
 *     4. Decoded data must be exactly 64 hex characters
 *     5. Hex characters must be lowercase [0-9a-f]
 *
 *   Algorithm:
 *     1. Check prefix: if not starts with "npub1" → return false
 *     2. Attempt bech32 decode using nip19.decode()
 *     3. If decode throws → return false
 *     4. Verify decoded.type === 'npub'
 *     5. Extract pubkey from decoded.data
 *     6. Verify pubkey length === 64
 *     7. Verify pubkey matches regex /^[0-9a-f]{64}$/
 *     8. Return true only if all checks pass
 */

import { nip19 } from 'nostr-tools';

export function isValidNpub(npub: string): boolean {
  try {
    if (!npub.startsWith('npub1')) {
      return false;
    }

    const decoded = nip19.decode(npub);

    if (decoded.type !== 'npub') {
      return false;
    }

    const pubkey = decoded.data as string;
    return pubkey.length === 64 && /^[0-9a-f]{64}$/.test(pubkey);
  } catch {
    return false;
  }
}

/**
 * Extracts npub from various Nostr data formats found in QR codes or pasted input
 *
 * Supported formats:
 *   - npub1... (plain npub)
 *   - nostr:npub1... (URI with npub)
 *   - nprofile1... (profile with pubkey + relay hints)
 *   - nostr:nprofile1... (URI with nprofile)
 *   - 64-character hex public key (lowercase or uppercase)
 *
 * Returns:
 *   - { success: true, npub: string } if valid Nostr identity found
 *   - { success: false, error: string } if invalid or unrecognized format
 */
export function extractNpubFromNostrData(data: string):
  | { success: true; npub: string }
  | { success: false; error: string } {
  try {
    // Strip nostr: URI prefix if present
    let cleaned = data.trim();
    if (cleaned.toLowerCase().startsWith('nostr:')) {
      cleaned = cleaned.slice(6);
    }

    // Handle plain npub
    if (cleaned.startsWith('npub1')) {
      if (isValidNpub(cleaned)) {
        return { success: true, npub: cleaned };
      }
      return { success: false, error: 'Invalid npub format' };
    }

    // Handle nprofile (contains pubkey + optional relay hints)
    if (cleaned.startsWith('nprofile1')) {
      const decoded = nip19.decode(cleaned);
      if (decoded.type === 'nprofile') {
        const profileData = decoded.data as { pubkey: string; relays?: string[] };
        const pubkey = profileData.pubkey;

        if (pubkey && pubkey.length === 64 && /^[0-9a-f]{64}$/.test(pubkey)) {
          const npub = nip19.npubEncode(pubkey);
          return { success: true, npub };
        }
        return { success: false, error: 'Invalid pubkey in nprofile' };
      }
    }

    // Handle other NIP-19 formats that might contain pubkeys
    if (cleaned.startsWith('naddr1') || cleaned.startsWith('nevent1') || cleaned.startsWith('note1')) {
      return { success: false, error: 'QR code contains event/address data, not a user profile' };
    }

    if (cleaned.startsWith('nsec1')) {
      return { success: false, error: 'QR code contains a private key (nsec) - do not share!' };
    }

    // Handle hex public key (64 lowercase hex characters)
    if (cleaned.length === 64 && /^[0-9a-f]{64}$/.test(cleaned)) {
      const npub = nip19.npubEncode(cleaned);
      return { success: true, npub };
    }

    // Handle hex public key with uppercase (normalize to lowercase)
    if (cleaned.length === 64 && /^[0-9a-fA-F]{64}$/.test(cleaned)) {
      const npub = nip19.npubEncode(cleaned.toLowerCase());
      return { success: true, npub };
    }

    return { success: false, error: 'Input does not contain a valid Nostr identity' };
  } catch (e) {
    console.error('[npub-validation] Error extracting npub:', e);
    return { success: false, error: 'Failed to decode input data' };
  }
}
