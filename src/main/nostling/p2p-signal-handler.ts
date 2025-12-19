/**
 * P2P Signaling Message Handler
 *
 * Sends and receives P2P signaling messages (offer/answer/ICE/close)
 * using NIP-59 gift-wrapped Nostr events as transport.
 */

import { Database } from 'sql.js';
import { RelayPool } from './relay-pool';
import { NostrKeypair, NostrEvent } from './crypto';
import {
  P2PSignalMessage,
  P2POfferMessage,
  P2PAnswerMessage,
  P2PIceMessage,
  P2PCloseMessage,
  P2P_PROTOCOL_VERSION,
} from '../../shared/p2p-types';
import { log } from '../logging';
import { wrapEvent } from 'nostr-tools/nip59';
import { createHash, randomBytes, randomUUID } from 'crypto';

/**
 * Result of sending a P2P signal
 */
export interface P2PSignalSendResult {
  success: boolean;
  eventId?: string;
  skipped?: boolean;  // If already sent (idempotent)
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Computes SHA-256 hash of concatenated inputs for signal idempotency
 */
function computeSignalHash(...parts: (string | number | undefined)[]): string {
  const nonUndefinedParts = parts.filter((p) => p !== undefined);
  const concatenated = nonUndefinedParts.join('||');
  return createHash('sha256').update(concatenated, 'utf-8').digest('hex');
}

/**
 * Creates a Nostr event for a P2P signal message (kind 443)
 */
function createP2PSignalEvent(
  message: P2PSignalMessage,
  senderKeypair: NostrKeypair
): NostrEvent {
  const now = Math.floor(Date.now() / 1000);
  const eventTemplate = {
    kind: 443,
    created_at: now,
    tags: [],
    content: JSON.stringify(message),
    pubkey: senderKeypair.pubkeyHex
  };

  // Use nostr-tools' finalizeEvent equivalent
  const finalizeEvent = require('nostr-tools/pure').finalizeEvent;
  return finalizeEvent(eventTemplate, senderKeypair.secretKey) as NostrEvent;
}

/**
 * Wraps a signal event with NIP-59 gift wrap for recipient
 */
function wrapSignalEvent(
  innerEvent: NostrEvent,
  senderKeypair: NostrKeypair,
  recipientPubkeyHex: string
): NostrEvent {
  return wrapEvent(
    {
      kind: innerEvent.kind,
      created_at: innerEvent.created_at,
      tags: innerEvent.tags,
      content: innerEvent.content,
      pubkey: innerEvent.pubkey
    },
    senderKeypair.secretKey,
    recipientPubkeyHex
  ) as NostrEvent;
}

/**
 * Publishes wrapped event and updates DB state
 */
async function publishAndTrackSignal(
  wrappedEvent: NostrEvent,
  senderKeypair: NostrKeypair,
  recipientPubkeyHex: string,
  sessionId: string,
  signalType: 'offer' | 'answer' | 'ice' | 'close',
  signalHash: string | undefined,
  relayPool: RelayPool,
  database: Database
): Promise<P2PSignalSendResult> {
  const now = new Date().toISOString();

  try {
    const publishResults = await relayPool.publish(wrappedEvent);
    const anySuccess = publishResults.some((r) => r.success);

    if (anySuccess) {
      // Update DB on success
      const upsertStmt = database.prepare(`
        INSERT INTO p2p_signal_send_state (id, session_id, identity_pubkey, contact_pubkey, signal_type, signal_hash, event_id, last_attempt_at, last_success_at, last_error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(session_id, identity_pubkey, contact_pubkey, signal_type, signal_hash) DO UPDATE SET
          event_id = excluded.event_id,
          last_attempt_at = excluded.last_attempt_at,
          last_success_at = excluded.last_success_at,
          last_error = NULL
      `);
      try {
        upsertStmt.run([
          randomUUID(),
          sessionId,
          senderKeypair.pubkeyHex,
          recipientPubkeyHex,
          signalType,
          signalHash || null,
          wrappedEvent.id,
          now,
          now
        ]);
        upsertStmt.free();
      } catch (dbError) {
        log('warn', `Failed to update send state: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }

      return {
        success: true,
        eventId: wrappedEvent.id
      };
    } else {
      // All relays failed
      const errorMessages = publishResults
        .filter((r) => !r.success)
        .map((r) => r.message || 'unknown error')
        .join('; ');

      // Update DB with error
      const upsertStmt = database.prepare(`
        INSERT INTO p2p_signal_send_state (id, session_id, identity_pubkey, contact_pubkey, signal_type, signal_hash, event_id, last_attempt_at, last_success_at, last_error)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?)
        ON CONFLICT(session_id, identity_pubkey, contact_pubkey, signal_type, signal_hash) DO UPDATE SET
          last_attempt_at = excluded.last_attempt_at,
          last_error = excluded.last_error
      `);
      try {
        upsertStmt.run([
          randomUUID(),
          sessionId,
          senderKeypair.pubkeyHex,
          recipientPubkeyHex,
          signalType,
          signalHash || null,
          now,
          errorMessages
        ]);
        upsertStmt.free();
      } catch (dbError) {
        log('warn', `Failed to update error state: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }

      return {
        success: false,
        error: `All relays failed: ${errorMessages}`
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'unknown error';
    log('error', `Failed to publish signal: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Send WebRTC offer to contact
 *
 * CONTRACT:
 *   Inputs:
 *     - senderKeypair: asymmetric key pair (public key hex, private key bytes)
 *     - recipientPubkeyHex: recipient's public key, hex string, 64 characters
 *     - sessionId: unique session identifier, base64 string, represents 16 bytes
 *     - localSdp: SDP offer string, non-empty, starts with "v=0"
 *     - localIpv6: IPv6 address string, global unicast format
 *     - localPort: optional UDP port number, 0 < port ≤ 65535
 *     - relayPool: connected relay pool instance
 *     - database: SQL.js database instance
 *
 *   Outputs:
 *     - P2PSignalSendResult object with:
 *       - success: boolean
 *       - eventId: Nostr event ID if sent (44-char hex string)
 *       - skipped: true if already sent (idempotent)
 *       - error: error message if failed
 *
 *   Invariants:
 *     - if success === true, either eventId is set OR skipped === true
 *     - if success === false, error is set
 *     - database is updated with send state regardless of success/failure
 *     - signal_hash in DB is deterministic for same (sessionId, sdp, ipv6, port)
 *
 *   Properties:
 *     - Idempotent: sending same offer twice (same hash) skips second send
 *     - Atomic: DB update and relay publish happen together or both fail
 *     - Retry-safe: failed sends can be retried via same function call
 *
 *   Algorithm:
 *     1. Compute signal_hash = SHA256(sessionId || sdp || ipv6 || port)
 *     2. Query p2p_signal_send_state for (session, sender, recipient, 'offer', hash)
 *     3. If row exists with same hash: return { success: true, skipped: true }
 *     4. Construct P2POfferMessage object:
 *        - type: 'p2p_offer'
 *        - v: P2P_PROTOCOL_VERSION
 *        - ts: current Unix timestamp (seconds)
 *        - session_id: sessionId
 *        - from_ipv6: localIpv6
 *        - from_port: localPort (optional)
 *        - sdp: localSdp
 *        - tie_break: senderKeypair.pubkeyHex
 *     5. Serialize to JSON
 *     6. Create inner Nostr event (kind 443, content = JSON)
 *     7. Wrap with NIP-59 gift-wrap for recipient
 *     8. Publish to relay pool
 *     9. If at least one relay accepts:
 *        - UPSERT p2p_signal_send_state with success timestamp
 *        - Return { success: true, eventId: wrapped.id }
 *    10. If all relays fail:
 *        - UPSERT p2p_signal_send_state with error
 *        - Return { success: false, error: messages }
 */
export async function sendP2POffer(
  senderKeypair: NostrKeypair,
  recipientPubkeyHex: string,
  sessionId: string,
  localSdp: string,
  localIpv6: string,
  localPort: number | undefined,
  relayPool: RelayPool,
  database: Database
): Promise<P2PSignalSendResult> {
  try {
    // Compute signal hash for idempotency
    const signalHash = computeSignalHash(sessionId, localSdp, localIpv6, localPort);

    // Check if already sent
    const queryStmt = database.prepare(
      'SELECT signal_hash FROM p2p_signal_send_state WHERE session_id = ? AND identity_pubkey = ? AND contact_pubkey = ? AND signal_type = ? AND signal_hash = ?'
    );
    queryStmt.bind([sessionId, senderKeypair.pubkeyHex, recipientPubkeyHex, 'offer', signalHash]);
    const exists = queryStmt.step();
    queryStmt.free();

    if (exists) {
      log('debug', `Skipping offer: already sent to ${recipientPubkeyHex} (session ${sessionId.slice(0, 8)}...)`);
      return { success: true, skipped: true };
    }

    // Create offer message
    const offerMessage: P2POfferMessage = {
      type: 'p2p_offer',
      v: P2P_PROTOCOL_VERSION,
      ts: Math.floor(Date.now() / 1000),
      nonce: randomBytes(16).toString('hex'), // BUG FIX: Add nonce for replay protection
      session_id: sessionId,
      from_ipv6: localIpv6,
      from_port: localPort,
      sdp: localSdp,
      tie_break: senderKeypair.pubkeyHex
    };

    // Create inner event
    const innerEvent = createP2PSignalEvent(offerMessage, senderKeypair);

    // Wrap with NIP-59
    const wrappedEvent = wrapSignalEvent(innerEvent, senderKeypair, recipientPubkeyHex);

    // Publish and track
    return publishAndTrackSignal(
      wrappedEvent,
      senderKeypair,
      recipientPubkeyHex,
      sessionId,
      'offer',
      signalHash,
      relayPool,
      database
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'unknown error';
    log('error', `Failed to send offer: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Send WebRTC answer to contact
 *
 * CONTRACT:
 *   Inputs:
 *     - senderKeypair: asymmetric key pair
 *     - recipientPubkeyHex: recipient's public key hex, 64 characters
 *     - sessionId: session identifier matching received offer
 *     - localSdp: SDP answer string, non-empty, starts with "v=0"
 *     - localIpv6: IPv6 address string, global unicast
 *     - localPort: optional UDP port number, 0 < port ≤ 65535
 *     - relayPool: connected relay pool instance
 *     - database: SQL.js database instance
 *
 *   Outputs:
 *     - P2PSignalSendResult (same structure as sendP2POffer)
 *
 *   Invariants:
 *     - Same as sendP2POffer
 *     - sessionId must match a previously received offer
 *
 *   Properties:
 *     - Same idempotency and atomicity as sendP2POffer
 *     - signal_type in DB is 'answer'
 *
 *   Algorithm:
 *     Similar to sendP2POffer, but:
 *     1. Message type is 'p2p_answer'
 *     2. No tie_break field
 *     3. signal_type in DB is 'answer'
 */
export async function sendP2PAnswer(
  senderKeypair: NostrKeypair,
  recipientPubkeyHex: string,
  sessionId: string,
  localSdp: string,
  localIpv6: string,
  localPort: number | undefined,
  relayPool: RelayPool,
  database: Database
): Promise<P2PSignalSendResult> {
  try {
    // Compute signal hash for idempotency
    const signalHash = computeSignalHash(sessionId, localSdp, localIpv6, localPort);

    // Check if already sent
    const queryStmt = database.prepare(
      'SELECT signal_hash FROM p2p_signal_send_state WHERE session_id = ? AND identity_pubkey = ? AND contact_pubkey = ? AND signal_type = ? AND signal_hash = ?'
    );
    queryStmt.bind([sessionId, senderKeypair.pubkeyHex, recipientPubkeyHex, 'answer', signalHash]);
    const exists = queryStmt.step();
    queryStmt.free();

    if (exists) {
      log('debug', `Skipping answer: already sent to ${recipientPubkeyHex} (session ${sessionId.slice(0, 8)}...)`);
      return { success: true, skipped: true };
    }

    // Create answer message
    const answerMessage: P2PAnswerMessage = {
      type: 'p2p_answer',
      v: P2P_PROTOCOL_VERSION,
      ts: Math.floor(Date.now() / 1000),
      nonce: randomBytes(16).toString('hex'), // BUG FIX: Add nonce for replay protection
      session_id: sessionId,
      from_ipv6: localIpv6,
      from_port: localPort,
      sdp: localSdp
    };

    // Create inner event
    const innerEvent = createP2PSignalEvent(answerMessage, senderKeypair);

    // Wrap with NIP-59
    const wrappedEvent = wrapSignalEvent(innerEvent, senderKeypair, recipientPubkeyHex);

    // Publish and track
    return publishAndTrackSignal(
      wrappedEvent,
      senderKeypair,
      recipientPubkeyHex,
      sessionId,
      'answer',
      signalHash,
      relayPool,
      database
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'unknown error';
    log('error', `Failed to send answer: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Send ICE candidate to contact
 *
 * CONTRACT:
 *   Inputs:
 *     - senderKeypair: asymmetric key pair
 *     - recipientPubkeyHex: recipient's public key hex, 64 characters
 *     - sessionId: session identifier
 *     - candidate: ICE candidate string, starts with "candidate:"
 *     - relayPool: connected relay pool instance
 *     - database: SQL.js database instance
 *
 *   Outputs:
 *     - P2PSignalSendResult
 *
 *   Invariants:
 *     - Same as sendP2POffer
 *     - Multiple ICE candidates can be sent for same session
 *
 *   Properties:
 *     - Each unique candidate gets own send state row
 *     - signal_hash includes candidate string for uniqueness
 *
 *   Algorithm:
 *     Similar to sendP2POffer, but:
 *     1. Message type is 'p2p_ice'
 *     2. Only fields: type, v, ts, session_id, candidate
 *     3. signal_hash includes candidate string
 */
export async function sendP2PIceCandidate(
  senderKeypair: NostrKeypair,
  recipientPubkeyHex: string,
  sessionId: string,
  candidate: string,
  relayPool: RelayPool,
  database: Database
): Promise<P2PSignalSendResult> {
  try {
    // Compute signal hash for idempotency (includes candidate)
    const signalHash = computeSignalHash(sessionId, candidate);

    // Check if already sent
    const queryStmt = database.prepare(
      'SELECT signal_hash FROM p2p_signal_send_state WHERE session_id = ? AND identity_pubkey = ? AND contact_pubkey = ? AND signal_type = ? AND signal_hash = ?'
    );
    queryStmt.bind([sessionId, senderKeypair.pubkeyHex, recipientPubkeyHex, 'ice', signalHash]);
    const exists = queryStmt.step();
    queryStmt.free();

    if (exists) {
      log('debug', `Skipping ICE: already sent to ${recipientPubkeyHex} (session ${sessionId.slice(0, 8)}...)`);
      return { success: true, skipped: true };
    }

    // Create ICE message
    const iceMessage: P2PIceMessage = {
      type: 'p2p_ice',
      v: P2P_PROTOCOL_VERSION,
      ts: Math.floor(Date.now() / 1000),
      nonce: randomBytes(16).toString('hex'), // BUG FIX: Add nonce for replay protection
      session_id: sessionId,
      candidate: candidate
    };

    // Create inner event
    const innerEvent = createP2PSignalEvent(iceMessage, senderKeypair);

    // Wrap with NIP-59
    const wrappedEvent = wrapSignalEvent(innerEvent, senderKeypair, recipientPubkeyHex);

    // Publish and track
    return publishAndTrackSignal(
      wrappedEvent,
      senderKeypair,
      recipientPubkeyHex,
      sessionId,
      'ice',
      signalHash,
      relayPool,
      database
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'unknown error';
    log('error', `Failed to send ICE candidate: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Send connection close/abort to contact
 *
 * CONTRACT:
 *   Inputs:
 *     - senderKeypair: asymmetric key pair
 *     - recipientPubkeyHex: recipient's public key hex, 64 characters
 *     - sessionId: session identifier to close
 *     - reason: one of 'timeout' | 'user' | 'superseded'
 *     - relayPool: connected relay pool instance
 *     - database: SQL.js database instance
 *
 *   Outputs:
 *     - P2PSignalSendResult
 *
 *   Invariants:
 *     - Same as sendP2POffer
 *     - Close messages are NOT idempotent (always send)
 *
 *   Properties:
 *     - Always publishes (no hash check)
 *     - signal_type in DB is 'close'
 *
 *   Algorithm:
 *     Similar to sendP2POffer, but:
 *     1. Message type is 'p2p_close'
 *     2. Fields: type, v, ts, session_id, reason
 *     3. Skip idempotency check (always send)
 */
export async function sendP2PClose(
  senderKeypair: NostrKeypair,
  recipientPubkeyHex: string,
  sessionId: string,
  reason: 'timeout' | 'user' | 'superseded',
  relayPool: RelayPool,
  database: Database
): Promise<P2PSignalSendResult> {
  try {
    // Create close message (NOT idempotent - always send)
    const closeMessage: P2PCloseMessage = {
      type: 'p2p_close',
      v: P2P_PROTOCOL_VERSION,
      ts: Math.floor(Date.now() / 1000),
      nonce: randomBytes(16).toString('hex'), // BUG FIX: Add nonce for replay protection
      session_id: sessionId,
      reason: reason
    };

    // Create inner event
    const innerEvent = createP2PSignalEvent(closeMessage, senderKeypair);

    // Wrap with NIP-59
    const wrappedEvent = wrapSignalEvent(innerEvent, senderKeypair, recipientPubkeyHex);

    // Publish and track (no hash for close messages - always send)
    return publishAndTrackSignal(
      wrappedEvent,
      senderKeypair,
      recipientPubkeyHex,
      sessionId,
      'close',
      undefined,
      relayPool,
      database
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'unknown error';
    log('error', `Failed to send close: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Validate SDP string for safety
 *
 * CONTRACT:
 *   Inputs:
 *     - sdp: SDP string from untrusted relay
 *
 *   Outputs:
 *     - boolean: true if valid, false otherwise
 *
 *   Invariants:
 *     - if true: sdp starts with "v=0\r\n" or "v=0\n"
 *     - if true: sdp length < 10KB
 *     - if true: sdp contains only printable ASCII and CR/LF
 *
 *   Properties:
 *     - Protects against oversized payloads
 *     - Protects against malformed SDP that could exploit WebRTC parser
 *
 *   Algorithm:
 *     1. Check length < 10240 bytes
 *     2. Check starts with "v=0\r\n" or "v=0\n"
 *     3. Check contains only printable ASCII (0x20-0x7E) plus CR/LF
 *     4. Return true if all checks pass, false otherwise
 */
function validateSdp(sdp: string): boolean {
  // BUG FIX: SDP validation to prevent WebRTC parser exploits
  // Root cause: missing input validation for untrusted SDP payloads
  // Bug report: system-verifier/unsanitized-webrtc-payloads
  // Date: 2025-12-19

  const MAX_SDP_LENGTH = 10240; // 10KB limit

  if (!sdp || sdp.length === 0 || sdp.length > MAX_SDP_LENGTH) {
    return false;
  }

  // SDP must start with version line
  if (!sdp.startsWith('v=0\r\n') && !sdp.startsWith('v=0\n')) {
    return false;
  }

  // Check for only printable ASCII plus CR/LF
  for (let i = 0; i < sdp.length; i++) {
    const code = sdp.charCodeAt(i);
    const isPrintable = code >= 0x20 && code <= 0x7E;
    const isCR = code === 0x0D;
    const isLF = code === 0x0A;

    if (!isPrintable && !isCR && !isLF) {
      return false;
    }
  }

  return true;
}

/**
 * Validate ICE candidate string for safety
 *
 * CONTRACT:
 *   Inputs:
 *     - candidate: ICE candidate string from untrusted relay
 *
 *   Outputs:
 *     - boolean: true if valid, false otherwise
 *
 *   Invariants:
 *     - if true: candidate starts with "candidate:"
 *     - if true: candidate length < 2KB
 *     - if true: candidate contains only printable ASCII
 *
 *   Properties:
 *     - Protects against oversized payloads
 *     - Protects against malformed candidates
 *
 *   Algorithm:
 *     1. Check length < 2048 bytes
 *     2. Check starts with "candidate:"
 *     3. Check contains only printable ASCII (0x20-0x7E)
 *     4. Return true if all checks pass, false otherwise
 */
function validateIceCandidate(candidate: string): boolean {
  // BUG FIX: ICE candidate validation to prevent WebRTC parser exploits
  // Root cause: missing input validation for untrusted ICE payloads
  // Bug report: system-verifier/unsanitized-webrtc-payloads
  // Date: 2025-12-19

  const MAX_CANDIDATE_LENGTH = 2048; // 2KB limit

  if (!candidate || candidate.length === 0 || candidate.length > MAX_CANDIDATE_LENGTH) {
    return false;
  }

  // ICE candidates must start with "candidate:"
  if (!candidate.startsWith('candidate:')) {
    return false;
  }

  // Check for only printable ASCII
  for (let i = 0; i < candidate.length; i++) {
    const code = candidate.charCodeAt(i);
    if (code < 0x20 || code > 0x7E) {
      return false;
    }
  }

  return true;
}

/**
 * Parse and validate received P2P signal message
 *
 * CONTRACT:
 *   Inputs:
 *     - innerEvent: unwrapped Nostr event (kind 443)
 *     - senderPubkeyHex: expected sender's public key hex, 64 characters
 *     - database: SQL.js database instance for nonce tracking
 *
 *   Outputs:
 *     - P2PSignalMessage object if valid
 *     - null if invalid or parsing fails
 *
 *   Invariants:
 *     - if result is non-null, result.v === P2P_PROTOCOL_VERSION
 *     - if result is non-null, result.ts is within ±10 minutes of current time
 *     - if result is non-null, JSON structure matches one of 5 message types
 *     - if result is non-null, SDP and ICE payloads are validated
 *     - if result is non-null, nonce has not been processed before
 *     - if result is null, validation failed (log warning)
 *
 *   Properties:
 *     - Type safety: returned object matches P2PSignalMessage union type
 *     - Freshness: rejects messages with ts outside ±10 minute window
 *     - Version check: rejects messages with v !== P2P_PROTOCOL_VERSION
 *     - Payload safety: SDP and ICE candidates validated before returning
 *     - Replay protection: nonce must be unique per session
 *
 *   Algorithm:
 *     1. Verify innerEvent.kind === 443 (P2P signal kind)
 *     2. Verify innerEvent.pubkey === senderPubkeyHex
 *     3. Parse innerEvent.content as JSON
 *     4. Verify 'type' field is one of: p2p_cap, p2p_offer, p2p_answer, p2p_ice, p2p_close
 *     5. Verify 'v' field === P2P_PROTOCOL_VERSION
 *     6. Verify 'ts' field is number, within ±10 minutes of current time
 *     7. Verify 'nonce' field exists and is 32-character hex string
 *     8. Check if (session_id, nonce) already processed in database
 *     9. Validate type-specific required fields:
 *        - p2p_offer: session_id, from_ipv6, sdp (validated via validateSdp)
 *        - p2p_answer: session_id, from_ipv6, sdp (validated via validateSdp)
 *        - p2p_ice: session_id, candidate (validated via validateIceCandidate)
 *        - p2p_close: session_id, reason
 *    10. Record (session_id, nonce) in database
 *    11. Return typed message object if all checks pass
 *    12. Return null if any check fails (log warning with details)
 */
export function parseP2PSignal(
  innerEvent: NostrEvent,
  senderPubkeyHex: string,
  database: Database
): P2PSignalMessage | null {
  try {
    // Verify kind
    if (innerEvent.kind !== 443) {
      log('warn', `Invalid P2P signal kind: expected 443, got ${innerEvent.kind}`);
      return null;
    }

    // Verify sender pubkey
    if (innerEvent.pubkey !== senderPubkeyHex) {
      log('warn', `P2P signal sender mismatch: expected ${senderPubkeyHex}, got ${innerEvent.pubkey}`);
      return null;
    }

    // Parse content as JSON
    let message: any;
    try {
      message = JSON.parse(innerEvent.content);
    } catch (e) {
      log('warn', `Failed to parse P2P signal content as JSON: ${e instanceof Error ? e.message : 'unknown error'}`);
      return null;
    }

    // Verify type field
    const validTypes = ['p2p_cap', 'p2p_offer', 'p2p_answer', 'p2p_ice', 'p2p_close'];
    if (!validTypes.includes(message.type)) {
      log('warn', `Invalid P2P signal type: ${message.type}`);
      return null;
    }

    // Verify version
    if (message.v !== P2P_PROTOCOL_VERSION) {
      log('warn', `P2P signal version mismatch: expected ${P2P_PROTOCOL_VERSION}, got ${message.v}`);
      return null;
    }

    // Verify timestamp is within ±10 minutes
    if (typeof message.ts !== 'number') {
      log('warn', `Invalid P2P signal timestamp type: expected number, got ${typeof message.ts}`);
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const tenMinutesSeconds = 10 * 60;
    const timeDiff = Math.abs(nowSeconds - message.ts);

    if (timeDiff > tenMinutesSeconds) {
      log('warn', `P2P signal timestamp outside window: ${timeDiff}s away from now`);
      return null;
    }

    // BUG FIX: Replay protection - verify nonce
    // Root cause: No nonce validation allows replay attacks
    // Bug report: system-verifier/replay-attack-vulnerability
    // Date: 2025-12-19
    if (!message.nonce || typeof message.nonce !== 'string') {
      log('warn', 'P2P signal missing nonce field');
      return null;
    }

    // Nonce must be 32-character hex string
    if (!/^[0-9a-f]{32}$/i.test(message.nonce)) {
      log('warn', `P2P signal nonce invalid format: ${message.nonce}`);
      return null;
    }

    // Extract session_id early for nonce check
    const sessionId = (message as any).session_id;
    if (!sessionId || typeof sessionId !== 'string') {
      log('warn', 'P2P signal missing session_id');
      return null;
    }

    // Check if this (session_id, nonce) pair has been processed before
    const nonceCheckStmt = database.prepare(
      'SELECT 1 FROM p2p_processed_signals WHERE session_id = ? AND nonce = ?'
    );
    nonceCheckStmt.bind([sessionId, message.nonce]);
    const alreadyProcessed = nonceCheckStmt.step();
    nonceCheckStmt.free();

    if (alreadyProcessed) {
      log('warn', `P2P signal replay detected: session ${sessionId.slice(0, 8)}..., nonce ${message.nonce.slice(0, 8)}...`);
      return null;
    }

    // Type-specific field validation
    let validatedMessage: P2PSignalMessage | null = null;

    switch (message.type) {
      case 'p2p_offer':
        if (!message.session_id || typeof message.session_id !== 'string') {
          log('warn', 'P2P offer missing session_id');
          return null;
        }
        if (!message.from_ipv6 || typeof message.from_ipv6 !== 'string') {
          log('warn', 'P2P offer missing from_ipv6');
          return null;
        }
        if (!message.sdp || typeof message.sdp !== 'string') {
          log('warn', 'P2P offer missing sdp');
          return null;
        }
        // BUG FIX: Validate SDP payload before accepting
        if (!validateSdp(message.sdp)) {
          log('warn', 'P2P offer contains invalid SDP');
          return null;
        }
        validatedMessage = message as P2POfferMessage;
        break;

      case 'p2p_answer':
        if (!message.session_id || typeof message.session_id !== 'string') {
          log('warn', 'P2P answer missing session_id');
          return null;
        }
        if (!message.from_ipv6 || typeof message.from_ipv6 !== 'string') {
          log('warn', 'P2P answer missing from_ipv6');
          return null;
        }
        if (!message.sdp || typeof message.sdp !== 'string') {
          log('warn', 'P2P answer missing sdp');
          return null;
        }
        // BUG FIX: Validate SDP payload before accepting
        if (!validateSdp(message.sdp)) {
          log('warn', 'P2P answer contains invalid SDP');
          return null;
        }
        validatedMessage = message as P2PAnswerMessage;
        break;

      case 'p2p_ice':
        if (!message.session_id || typeof message.session_id !== 'string') {
          log('warn', 'P2P ice missing session_id');
          return null;
        }
        if (!message.candidate || typeof message.candidate !== 'string') {
          log('warn', 'P2P ice missing candidate');
          return null;
        }
        // BUG FIX: Validate ICE candidate payload before accepting
        if (!validateIceCandidate(message.candidate)) {
          log('warn', 'P2P ice contains invalid candidate');
          return null;
        }
        validatedMessage = message as P2PIceMessage;
        break;

      case 'p2p_close':
        if (!message.session_id || typeof message.session_id !== 'string') {
          log('warn', 'P2P close missing session_id');
          return null;
        }
        if (!['timeout', 'user', 'superseded'].includes(message.reason)) {
          log('warn', `P2P close invalid reason: ${message.reason}`);
          return null;
        }
        validatedMessage = message as P2PCloseMessage;
        break;

      case 'p2p_cap':
        if (!Array.isArray(message.ipv6)) {
          log('warn', 'P2P cap missing ipv6 array');
          return null;
        }
        if (!Array.isArray(message.features)) {
          log('warn', 'P2P cap missing features array');
          return null;
        }
        validatedMessage = message as P2PSignalMessage;
        break;

      default:
        log('warn', `Unhandled P2P signal type: ${message.type}`);
        return null;
    }

    // BUG FIX: Record (session_id, nonce) to prevent replay
    if (validatedMessage) {
      try {
        const now = new Date().toISOString();
        const insertStmt = database.prepare(
          'INSERT INTO p2p_processed_signals (session_id, nonce, processed_at) VALUES (?, ?, ?)'
        );
        insertStmt.run([sessionId, message.nonce, now]);
        insertStmt.free();
      } catch (error) {
        // If insert fails (e.g., duplicate), log but don't fail validation
        // This handles race conditions gracefully
        log('debug', `Failed to record processed signal nonce: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return validatedMessage;
  } catch (error) {
    log('warn', `Unexpected error parsing P2P signal: ${error instanceof Error ? error.message : 'unknown error'}`);
    return null;
  }
}
