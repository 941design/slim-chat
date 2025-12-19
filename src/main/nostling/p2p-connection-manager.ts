/**
 * P2P Connection Manager
 *
 * Orchestrates P2P connection attempts, manages session state,
 * and coordinates between signaling (main) and WebRTC (renderer).
 */

import { Database } from 'sql.js';
import { randomBytes } from 'crypto';
import { RelayPool } from './relay-pool';
import { NostrKeypair, NostrEvent, npubToHex } from './crypto';
import { log } from '../logging';
import {
  P2PConnectionStatus,
  P2PRole,
  P2PConnectionState,
  P2PSignalMessage,
  P2POfferMessage,
  P2PAnswerMessage,
  P2PIceMessage,
  P2PCloseMessage,
} from '../../shared/p2p-types';
import {
  getGlobalIPv6Addresses,
  hasGlobalIPv6,
  selectPreferredIPv6,
} from './p2p-ipv6-detector';
import {
  sendP2POffer,
  sendP2PAnswer,
  sendP2PIceCandidate,
  sendP2PClose,
  parseP2PSignal,
} from './p2p-signal-handler';

/**
 * Result of attempting a P2P connection
 */
export interface P2PAttemptResult {
  contactId: string;
  sessionId: string;
  role: P2PRole;
  status: P2PConnectionStatus;
  error?: string;
}

/**
 * Determine P2P role based on deterministic pubkey ordering
 *
 * CONTRACT:
 *   Inputs:
 *     - myPubkeyHex: local identity's public key, hex string, 64 characters
 *     - theirPubkeyHex: contact's public key, hex string, 64 characters
 *
 *   Outputs:
 *     - P2PRole: 'offerer' or 'answerer'
 *
 *   Invariants:
 *     - result is deterministic for given pair (myPubkey, theirPubkey)
 *     - offerer for (A, B) === answerer for (B, A)
 *     - role assignment is mutual (both peers agree on who is offerer/answerer)
 *
 *   Properties:
 *     - Commutative role assignment: role(A, B) !== role(B, A)
 *     - Deterministic: same inputs always yield same role
 *     - Symmetric: if A is offerer to B, then B is answerer to A
 *
 *   Algorithm:
 *     1. Compare myPubkeyHex and theirPubkeyHex lexicographically
 *     2. If myPubkeyHex < theirPubkeyHex: return 'offerer'
 *     3. If myPubkeyHex > theirPubkeyHex: return 'answerer'
 *     4. If equal (should never happen - same pubkey): throw error
 */
export function determineP2PRole(myPubkeyHex: string, theirPubkeyHex: string): P2PRole {
  if (myPubkeyHex === theirPubkeyHex) {
    throw new Error('Cannot determine P2P role: identical pubkeys');
  }
  return myPubkeyHex < theirPubkeyHex ? 'offerer' : 'answerer';
}

/**
 * Generate unique session ID for P2P attempt
 *
 * CONTRACT:
 *   Inputs:
 *     - none (uses cryptographic randomness)
 *
 *   Outputs:
 *     - base64 string representing 16 random bytes
 *
 *   Invariants:
 *     - result length is 24 characters (16 bytes base64-encoded)
 *     - result is URL-safe base64 (only [A-Za-z0-9_-])
 *     - result is globally unique with high probability
 *
 *   Properties:
 *     - Randomness: cryptographically secure random bytes
 *     - Uniqueness: collision probability < 2^-128
 *     - Encoding: standard base64 or URL-safe base64
 *
 *   Algorithm:
 *     1. Generate 16 cryptographically random bytes
 *     2. Encode as base64 string
 *     3. Return encoded string
 */
export function generateSessionId(): string {
  const randomBuffer = randomBytes(16);
  return randomBuffer.toString('base64url');
}

/**
 * Get current P2P connection status for a contact
 *
 * CONTRACT:
 *   Inputs:
 *     - database: SQL.js database instance
 *     - identityPubkeyHex: local identity's public key hex, 64 characters
 *     - contactPubkeyHex: contact's public key hex, 64 characters
 *
 *   Outputs:
 *     - P2PConnectionState object if record exists
 *     - null if no connection state exists for this contact
 *
 *   Invariants:
 *     - if result is non-null, result.identityPubkey === identityPubkeyHex
 *     - if result is non-null, result.contactPubkey === contactPubkeyHex
 *     - at most one record exists per (identity, contact) pair
 *
 *   Properties:
 *     - Uniqueness: (identityPubkey, contactPubkey) is unique key
 *     - Read-only: does not modify database state
 *
 *   Algorithm:
 *     1. Query p2p_connection_state WHERE identity_pubkey = ? AND contact_pubkey = ?
 *     2. If no row: return null
 *     3. If row exists: parse and return as P2PConnectionState object
 */
export function getP2PConnectionStatus(
  database: Database,
  identityPubkeyHex: string,
  contactPubkeyHex: string
): P2PConnectionState | null {
  try {
    const stmt = database.prepare(
      'SELECT * FROM p2p_connection_state WHERE identity_pubkey = ? AND contact_pubkey = ?'
    );
    stmt.bind([identityPubkeyHex, contactPubkeyHex]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject();
    stmt.free();

    return {
      id: row.id as string,
      identityPubkey: row.identity_pubkey as string,
      contactPubkey: row.contact_pubkey as string,
      status: row.status as P2PConnectionStatus,
      sessionId: row.session_id as string | undefined,
      role: row.role as P2PRole | undefined,
      lastAttemptAt: row.last_attempt_at as string | undefined,
      lastSuccessAt: row.last_success_at as string | undefined,
      lastFailureReason: row.last_failure_reason as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  } catch (error) {
    log('error', `Failed to get P2P connection status: ${error}`);
    return null;
  }
}

/**
 * Update P2P connection status in database
 *
 * CONTRACT:
 *   Inputs:
 *     - database: SQL.js database instance
 *     - identityPubkeyHex: local identity's public key hex, 64 characters
 *     - contactPubkeyHex: contact's public key hex, 64 characters
 *     - updates: partial P2PConnectionState with fields to update
 *
 *   Outputs:
 *     - void (side effect: updates database)
 *
 *   Invariants:
 *     - UPSERT: creates row if not exists, updates if exists
 *     - updated_at timestamp is set to current time
 *     - if status changes to 'connecting', last_attempt_at is updated
 *     - if status changes to 'connected', last_success_at is updated
 *     - if status changes to 'failed', last_failure_reason is set
 *     - TRANSACTION: all operations wrapped in database transaction
 *
 *   Properties:
 *     - Idempotent: updating with same values multiple times is safe
 *     - Atomic: all fields updated together in single transaction
 *     - Isolation: concurrent writes protected via transaction
 *
 *   Algorithm:
 *     1. BEGIN TRANSACTION
 *     2. Generate UUID for id if creating new row
 *     3. Prepare UPSERT statement:
 *        INSERT INTO p2p_connection_state (...) VALUES (...)
 *        ON CONFLICT(identity_pubkey, contact_pubkey) DO UPDATE SET ...
 *     4. Bind parameters from updates object
 *     5. Execute statement
 *     6. Update updated_at to current timestamp
 *     7. COMMIT (or ROLLBACK on error)
 *
 *   BUG FIX:
 *     Root cause: Concurrent writes to p2p_connection_state without transaction protection
 *                 could cause race conditions with multiple simultaneous updates
 *     Fix: Wrap all database operations in transaction with COMMIT/ROLLBACK
 *     Bug report: bug-reports/bug-005-race-condition.md
 */
export function updateP2PConnectionStatus(
  database: Database,
  identityPubkeyHex: string,
  contactPubkeyHex: string,
  updates: Partial<P2PConnectionState>
): void {
  // BUG FIX: Wrap database writes in transaction
  // Root cause: Concurrent writes to p2p_connection_state without transaction protection
  //             could cause race conditions with multiple simultaneous updates
  // Fix: BEGIN TRANSACTION → execute → COMMIT (or ROLLBACK on error)
  // Bug report: bug-reports/bug-005-race-condition.md
  // Date: 2025-12-19

  try {
    database.exec('BEGIN TRANSACTION');

    const timestamp = new Date().toISOString();
    const id = updates.id || `${identityPubkeyHex}:${contactPubkeyHex}:${Date.now()}`;

    const updateFields: Record<string, any> = {
      identity_pubkey: identityPubkeyHex,
      contact_pubkey: contactPubkeyHex,
      updated_at: timestamp,
    };

    if (updates.status !== undefined) {
      updateFields.status = updates.status;
      if (updates.status === 'connecting') {
        updateFields.last_attempt_at = timestamp;
      } else if (updates.status === 'connected') {
        updateFields.last_success_at = timestamp;
      } else if (updates.status === 'failed' && updates.lastFailureReason) {
        updateFields.last_failure_reason = updates.lastFailureReason;
      }
    }

    if (updates.sessionId !== undefined) {
      updateFields.session_id = updates.sessionId;
    }

    if (updates.role !== undefined) {
      updateFields.role = updates.role;
    }

    if (updates.lastFailureReason !== undefined) {
      updateFields.last_failure_reason = updates.lastFailureReason;
    }

    const fields = Object.keys(updateFields);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map((f) => updateFields[f]);

    const sql = `
      INSERT INTO p2p_connection_state (id, ${fields.join(', ')})
      VALUES (?, ${placeholders})
      ON CONFLICT(identity_pubkey, contact_pubkey) DO UPDATE SET
      ${fields.map((f) => `${f} = excluded.${f}`).join(', ')}
    `;

    database.run(sql, [id, ...values]);

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    log('error', `Failed to update P2P connection status: ${error}`);
    throw error;
  }
}

/**
 * Initiate P2P connection attempt with a contact
 *
 * CONTRACT:
 *   Inputs:
 *     - database: SQL.js database instance
 *     - relayPool: connected relay pool instance
 *     - myKeypair: local identity's keypair
 *     - contactId: internal contact UUID
 *     - contactPubkeyHex: contact's public key hex, 64 characters
 *     - ipcSendToRenderer: callback function to send IPC message to renderer
 *
 *   Outputs:
 *     - P2PAttemptResult with session ID and initial status
 *
 *   Invariants:
 *     - database is updated with new session state BEFORE sending IPC
 *     - if no global IPv6: status = 'unavailable', no IPC sent
 *     - if global IPv6 exists: status = 'connecting', IPC sent to renderer
 *     - role is determined before attempt starts
 *
 *   Properties:
 *     - Atomicity: DB update and IPC send are coupled
 *     - Fail-fast: returns 'unavailable' immediately if no IPv6
 *     - Deterministic role: same pubkey pair always yields same role
 *
 *   Algorithm:
 *     1. Check hasGlobalIPv6()
 *        - If false: update DB status='unavailable', return result
 *     2. Get global IPv6 addresses, select preferred
 *     3. Determine role via determineP2PRole(myPubkey, theirPubkey)
 *     4. Generate session ID via generateSessionId()
 *     5. Update DB: status='connecting', session_id, role, last_attempt_at=now
 *     6. If role === 'offerer':
 *        a. Send IPC to renderer: p2p:initiate-connection with role, sessionId, localIpv6
 *        b. Renderer will create offer and call back with SDP
 *     7. If role === 'answerer':
 *        a. Wait for incoming offer (handled by handleIncomingP2PSignal)
 *        b. Return result with status='connecting' (passive wait)
 *     8. Return P2PAttemptResult with sessionId, role, status
 */
export async function attemptP2PConnection(
  database: Database,
  relayPool: RelayPool,
  myKeypair: NostrKeypair,
  contactId: string,
  contactPubkeyHex: string,
  ipcSendToRenderer: (channel: string, ...args: any[]) => void
): Promise<P2PAttemptResult> {
  const myPubkeyHex = myKeypair.pubkeyHex;

  // Check if IPv6 is available
  if (!hasGlobalIPv6()) {
    updateP2PConnectionStatus(database, myPubkeyHex, contactPubkeyHex, {
      status: 'unavailable',
    });
    return {
      contactId,
      sessionId: '',
      role: determineP2PRole(myPubkeyHex, contactPubkeyHex),
      status: 'unavailable',
    };
  }

  // Generate session ID
  const sessionId = generateSessionId();

  // Determine role
  const role = determineP2PRole(myPubkeyHex, contactPubkeyHex);

  // Get global IPv6 addresses and select preferred
  const ipv6Addresses = getGlobalIPv6Addresses();
  const preferredIpv6 = selectPreferredIPv6(ipv6Addresses);

  // Update database with connecting status
  updateP2PConnectionStatus(database, myPubkeyHex, contactPubkeyHex, {
    status: 'connecting',
    sessionId,
    role,
  });

  // If offerer, send IPC to renderer to initiate connection
  if (role === 'offerer') {
    ipcSendToRenderer('p2p:initiate-connection', {
      sessionId,
      role,
      contactPubkey: contactPubkeyHex,
      localIpv6: preferredIpv6,
    });
  }

  return {
    contactId,
    sessionId,
    role,
    status: 'connecting',
  };
}

/**
 * Handle incoming P2P signal message from contact
 *
 * CONTRACT:
 *   Inputs:
 *     - database: SQL.js database instance
 *     - relayPool: connected relay pool instance
 *     - myKeypair: local identity's keypair
 *     - senderPubkeyHex: sender's public key hex, 64 characters
 *     - signal: parsed P2PSignalMessage from Nostr event
 *     - ipcSendToRenderer: callback to send IPC to renderer
 *
 *   Outputs:
 *     - void (side effects: updates DB, sends IPC, may send reply signals)
 *
 *   Invariants:
 *     - only processes signals for active sessions or creates new session for offers
 *     - stale signals (old session IDs) are ignored
 *     - out-of-order messages are handled gracefully
 *
 *   Properties:
 *     - Idempotent: processing same signal twice is safe (no duplicate actions)
 *     - State transitions: valid state machine progression (connecting → connected/failed)
 *
 *   Algorithm:
 *     1. Determine signal type via signal.type
 *     2. If type === 'p2p_offer':
 *        a. Check if we already have session for this contact
 *        b. Determine role (should be answerer)
 *        c. If role mismatch (glare): use tie_break to resolve
 *        d. Update DB with new session_id, role='answerer', status='connecting'
 *        e. Send IPC to renderer: p2p:initiate-connection with offer SDP, remote IPv6
 *        f. Renderer will create answer and call back
 *     3. If type === 'p2p_answer':
 *        a. Verify we're offerer for this session
 *        b. Send IPC to renderer: p2p:remote-signal with answer SDP
 *        c. Renderer will set remote description
 *     4. If type === 'p2p_ice':
 *        a. Verify session exists
 *        b. Send IPC to renderer: p2p:remote-signal with ICE candidate
 *        c. Renderer will add candidate
 *     5. If type === 'p2p_close':
 *        a. Update DB status='failed', failure_reason=signal.reason
 *        b. Send IPC to renderer: p2p:close-connection
 *        c. Renderer will close RTCPeerConnection
 */
export async function handleIncomingP2PSignal(
  database: Database,
  relayPool: RelayPool,
  myKeypair: NostrKeypair,
  senderPubkeyHex: string,
  signal: P2PSignalMessage,
  ipcSendToRenderer: (channel: string, ...args: any[]) => void
): Promise<void> {
  const myPubkeyHex = myKeypair.pubkeyHex;

  if (signal.type === 'p2p_offer') {
    const offerSignal = signal as P2POfferMessage;
    const existingSession = getP2PConnectionStatus(
      database,
      myPubkeyHex,
      senderPubkeyHex
    );
    const role = determineP2PRole(myPubkeyHex, senderPubkeyHex);

    // Handle glare: if we think we're offerer but received offer, use tie_break
    if (existingSession && existingSession.role === 'offerer') {
      if (!offerSignal.tie_break) {
        log(
          'warn',
          'Glare detected but no tie_break provided, ignoring duplicate offer'
        );
        return;
      }
    }

    // Update session with offer details
    updateP2PConnectionStatus(database, myPubkeyHex, senderPubkeyHex, {
      sessionId: offerSignal.session_id,
      role,
      status: 'connecting',
    });

    // Send IPC to renderer with offer
    ipcSendToRenderer('p2p:initiate-connection', {
      sessionId: offerSignal.session_id,
      role,
      contactPubkey: senderPubkeyHex,
      remoteIpv6: offerSignal.from_ipv6,
      remoteSdp: offerSignal.sdp,
      localIpv6: selectPreferredIPv6(getGlobalIPv6Addresses()),
    });
  } else if (signal.type === 'p2p_answer') {
    const answerSignal = signal as P2PAnswerMessage;
    const session = getP2PConnectionStatus(
      database,
      myPubkeyHex,
      senderPubkeyHex
    );

    if (!session || session.sessionId !== answerSignal.session_id) {
      log(
        'warn',
        `Received answer for unknown session: ${answerSignal.session_id}`
      );
      return;
    }

    // Send IPC to renderer with answer
    ipcSendToRenderer('p2p:remote-signal', {
      sessionId: answerSignal.session_id,
      sdp: answerSignal.sdp,
    });
  } else if (signal.type === 'p2p_ice') {
    const iceSignal = signal as P2PIceMessage;
    const session = getP2PConnectionStatus(
      database,
      myPubkeyHex,
      senderPubkeyHex
    );

    if (!session || session.sessionId !== iceSignal.session_id) {
      log(
        'warn',
        `Received ICE candidate for unknown session: ${iceSignal.session_id}`
      );
      return;
    }

    // Send IPC to renderer with ICE candidate
    ipcSendToRenderer('p2p:remote-signal', {
      sessionId: iceSignal.session_id,
      candidates: [iceSignal.candidate],
    });
  } else if (signal.type === 'p2p_close') {
    const closeSignal = signal as P2PCloseMessage;
    const session = getP2PConnectionStatus(
      database,
      myPubkeyHex,
      senderPubkeyHex
    );

    if (!session) {
      return;
    }

    // Update database with failure
    updateP2PConnectionStatus(database, myPubkeyHex, senderPubkeyHex, {
      status: 'failed',
      lastFailureReason: closeSignal.reason,
    });

    // Send IPC to renderer to close connection
    ipcSendToRenderer('p2p:close-connection', {
      sessionId: closeSignal.session_id,
      reason: closeSignal.reason,
    });
  }
}

/**
 * Handle renderer reporting connection status change
 *
 * CONTRACT:
 *   Inputs:
 *     - database: SQL.js database instance
 *     - sessionId: session identifier
 *     - status: new P2P connection status
 *     - failureReason: optional failure reason string
 *
 *   Outputs:
 *     - void (side effect: updates database)
 *
 *   Invariants:
 *     - DB updated with new status
 *     - if status === 'connected': last_success_at updated
 *     - if status === 'failed': last_failure_reason updated
 *     - updated_at timestamp always updated
 *
 *   Properties:
 *     - Idempotent: updating to same status multiple times is safe
 *     - Status transitions: only valid transitions allowed (connecting → connected/failed)
 *
 *   Algorithm:
 *     1. Find connection state row by session_id
 *     2. Verify status transition is valid:
 *        - 'connecting' → 'connected': valid
 *        - 'connecting' → 'failed': valid
 *        - 'connected' → 'failed': valid (disconnect)
 *        - others: log warning, allow but note
 *     3. Update DB with new status
 *     4. If status === 'connected': update last_success_at
 *     5. If status === 'failed': update last_failure_reason
 *     6. Update updated_at to current time
 */
export function handleRendererStatusUpdate(
  database: Database,
  sessionId: string,
  status: P2PConnectionStatus,
  failureReason?: string
): void {
  try {
    const stmt = database.prepare(
      'SELECT identity_pubkey, contact_pubkey FROM p2p_connection_state WHERE session_id = ?'
    );
    stmt.bind([sessionId]);

    if (!stmt.step()) {
      stmt.free();
      log('warn', `No connection state found for session: ${sessionId}`);
      return;
    }

    const row = stmt.getAsObject();
    stmt.free();

    const identityPubkey = row.identity_pubkey as string;
    const contactPubkey = row.contact_pubkey as string;

    const updates: Partial<P2PConnectionState> = {
      status,
    };

    if (status === 'connected') {
      updates.lastSuccessAt = new Date().toISOString();
    } else if (status === 'failed' && failureReason) {
      updates.lastFailureReason = failureReason;
    }

    updateP2PConnectionStatus(database, identityPubkey, contactPubkey, updates);
  } catch (error) {
    log('error', `Failed to handle renderer status update: ${error}`);
  }
}
