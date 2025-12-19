/**
 * P2P Service Integration
 *
 * Integrates P2P connection management into NostlingService.
 * Handles connection triggers (online event, relay connection) and
 * routes incoming P2P signals from wrapped Nostr events.
 */

import { Database } from 'sql.js';
import { RelayPool } from './relay-pool';
import { NostrEvent, NostrKeypair, npubToHex } from './crypto';
import { log } from '../logging';
import { BrowserWindow } from 'electron';
import {
  attemptP2PConnection,
  handleIncomingP2PSignal,
} from './p2p-connection-manager';
import { parseP2PSignal } from './p2p-signal-handler';
import { sendP2PInitiateToRenderer, sendP2PRemoteSignalToRenderer } from '../ipc/p2p-handlers';
import { P2P_CONFIG } from '../../shared/p2p-types';

/**
 * Nostr event kind for P2P signaling messages (inner event after unwrapping)
 */
export const P2P_SIGNAL_EVENT_KIND = 443;

/**
 * Check if unwrapped event is a P2P signal
 *
 * CONTRACT:
 *   Inputs:
 *     - innerEvent: unwrapped Nostr event (from NIP-59 gift-wrap)
 *
 *   Outputs:
 *     - boolean: true if event.kind === P2P_SIGNAL_EVENT_KIND, else false
 *
 *   Invariants:
 *     - result === true ⟺ innerEvent.kind === 443
 *
 *   Properties:
 *     - Simple predicate: kind check only
 *
 *   Algorithm:
 *     1. Return innerEvent.kind === P2P_SIGNAL_EVENT_KIND
 */
export function isP2PSignalEvent(innerEvent: NostrEvent): boolean {
  return innerEvent.kind === P2P_SIGNAL_EVENT_KIND;
}

/**
 * Route incoming P2P signal to connection manager
 *
 * CONTRACT:
 *   Inputs:
 *     - database: SQL.js database instance
 *     - relayPool: connected relay pool
 *     - myKeypair: local identity's keypair
 *     - senderPubkeyHex: sender's public key (from unwrapped event)
 *     - innerEvent: unwrapped P2P signal event (kind 443)
 *     - mainWindow: BrowserWindow for sending IPC to renderer
 *
 *   Outputs:
 *     - void (side effects: may initiate connection, update DB, send IPC)
 *
 *   Invariants:
 *     - innerEvent.kind === P2P_SIGNAL_EVENT_KIND
 *     - signal is validated before processing
 *     - invalid signals are logged and ignored
 *
 *   Properties:
 *     - Validation: only well-formed signals are processed
 *     - Error tolerance: malformed signals don't crash service
 *
 *   Algorithm:
 *     1. Parse signal via parseP2PSignal(innerEvent, senderPubkeyHex)
 *     2. If parse fails (null): log warning, return
 *     3. Create IPC send callback:
 *        - Wraps sendP2PInitiateToRenderer and sendP2PRemoteSignalToRenderer
 *     4. Call handleIncomingP2PSignal(database, relayPool, myKeypair, senderPubkeyHex, signal, ipcCallback)
 *     5. If error thrown: log error, continue (don't propagate)
 */
export async function routeP2PSignal(
  database: Database,
  relayPool: RelayPool,
  myKeypair: NostrKeypair,
  senderPubkeyHex: string,
  innerEvent: NostrEvent,
  mainWindow: BrowserWindow | null
): Promise<void> {
  const signal = parseP2PSignal(innerEvent, senderPubkeyHex, database);

  if (!signal) {
    log('warn', `Invalid P2P signal from ${senderPubkeyHex}`);
    return;
  }

  // BUG FIX: Conditional IPC routing based on channel
  // Root cause: Both handlers were called regardless of signal type,
  //             causing incorrect message dispatch
  // Fix: Route based on channel parameter
  // Bug report: bug-reports/bug-004-ipc-dispatch.md
  // Date: 2025-12-19
  const ipcSendToRenderer = (channel: string, ...args: any[]) => {
    if (channel === 'p2p:initiate-connection') {
      sendP2PInitiateToRenderer(mainWindow, args[0]);
    } else if (channel === 'p2p:remote-signal') {
      sendP2PRemoteSignalToRenderer(mainWindow, args[0]);
    } else {
      log('warn', `Unknown P2P IPC channel: ${channel}`);
    }
  };

  try {
    await handleIncomingP2PSignal(database, relayPool, myKeypair, senderPubkeyHex, signal, ipcSendToRenderer);
  } catch (error) {
    log('error', `Error handling P2P signal: ${error}`);
  }
}

/**
 * Trigger P2P connection attempts for all contacts when going online
 *
 * CONTRACT:
 *   Inputs:
 *     - database: SQL.js database instance
 *     - relayPool: connected relay pool
 *     - identityPubkeyHex: local identity's public key hex
 *     - identityKeypair: local identity's keypair
 *     - mainWindow: BrowserWindow for sending IPC to renderer
 *
 *   Outputs:
 *     - void (side effects: initiates connections for all contacts)
 *
 *   Invariants:
 *     - attempts connection for each contact (not deleted)
 *     - skips contacts with status === 'connected' (already connected)
 *     - skips contacts with status === 'connecting' (attempt in progress)
 *     - triggers new attempts for 'unavailable' and 'failed'
 *     - BATCHING: processes MAX_CONCURRENT_CONNECTIONS (5) contacts at a time
 *
 *   Properties:
 *     - Idempotent: safe to call multiple times (checks existing status)
 *     - Batched: prevents resource exhaustion with many contacts
 *     - Rate-limited: 500ms delay between batches to prevent event loop blocking
 *
 *   Algorithm:
 *     1. Query contacts table WHERE identity_pubkey = ? AND deleted_at IS NULL
 *     2. Divide contacts into batches of MAX_CONCURRENT_CONNECTIONS
 *     3. For each batch:
 *        a. For each contact in batch:
 *           i. Get current P2P status from p2p_connection_state
 *           ii. If status === 'connected' or 'connecting': skip
 *           iii. Create IPC send callback for this contact
 *           iv. Call attemptP2PConnection(database, relayPool, identityKeypair, contact.id, contact.npub, ipcCallback)
 *           v. Log attempt result
 *        b. await Promise.all(batch)
 *        c. If more batches remain: wait 500ms before next batch
 *
 *   BUG FIX:
 *     Root cause: With 50+ contacts, parallel Promise.all creates 50+ RTCPeerConnection
 *                 objects simultaneously, blocking renderer event loop
 *     Fix: Batch processing with MAX_CONCURRENT_CONNECTIONS limit (5 at a time)
 *     Bug report: bug-reports/bug-003-resource-exhaustion.md
 */
export async function triggerP2PConnectionsOnOnline(
  database: Database,
  relayPool: RelayPool,
  identityPubkeyHex: string,
  identityKeypair: NostrKeypair,
  mainWindow: BrowserWindow | null
): Promise<void> {
  // Query all identities to find the one matching this pubkey
  const allIdentityResults = database.exec('SELECT id, npub FROM nostr_identities');

  if (!allIdentityResults.length || !allIdentityResults[0].values.length) {
    return;
  }

  let identityId: string | null = null;

  for (const row of allIdentityResults[0].values) {
    const id = row[0];
    const npub = row[1];
    const hexPubkey = npubToHex(npub as string);

    if (hexPubkey === identityPubkeyHex) {
      identityId = id as string;
      break;
    }
  }

  if (!identityId) {
    log('warn', `No identity found for pubkey ${identityPubkeyHex}`);
    return;
  }

  // Query contacts for this identity (not deleted)
  const contactResults = database.exec(
    `SELECT c.id, c.npub FROM nostr_contacts c WHERE c.identity_id = ? AND c.deleted_at IS NULL`,
    [identityId]
  );

  if (!contactResults.length || !contactResults[0].values.length) {
    return;
  }

  const contacts = contactResults[0].values.map((row) => ({
    id: row[0],
    npub: row[1],
  }));

  // BUG FIX: Batch connections to prevent resource exhaustion
  // Root cause: With 50+ contacts, parallel Promise.all creates 50+ RTCPeerConnection
  //             objects simultaneously, blocking renderer event loop
  // Fix: Process MAX_CONCURRENT_CONNECTIONS (5) at a time with delays
  // Bug report: bug-reports/bug-003-resource-exhaustion.md
  // Date: 2025-12-19
  const batchSize = P2P_CONFIG.MAX_CONCURRENT_CONNECTIONS;

  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);

    const batchPromises = batch.map(async (contact) => {
      const contactPubkeyHex = npubToHex(contact.npub as string);

      const statusResult = database.exec(
        `SELECT status FROM p2p_connection_state WHERE identity_pubkey = ? AND contact_pubkey = ?`,
        [identityPubkeyHex, contactPubkeyHex]
      );

      // Check if already connected or connecting
      if (statusResult.length && statusResult[0].values.length) {
        const [status] = statusResult[0].values[0];
        if (status === 'connected' || status === 'connecting') {
          return;
        }
      }

      const ipcSendToRenderer = (channel: string, ...args: any[]) => {
        if (mainWindow) {
          mainWindow.webContents.send(channel, ...args);
        }
      };

      try {
        const result = await attemptP2PConnection(
          database,
          relayPool,
          identityKeypair,
          contact.id as string,
          contactPubkeyHex,
          ipcSendToRenderer
        );
        log('info', `P2P connection attempt for ${contact.npub}: ${result.status}`);
      } catch (error) {
        log('error', `P2P connection attempt failed for ${contact.npub}: ${error}`);
      }
    });

    await Promise.all(batchPromises);

    // Brief delay between batches to prevent renderer event loop overload
    if (i + batchSize < contacts.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

/**
 * Integration hook: extend handleReceivedWrappedEvent to route P2P signals
 *
 * CONTRACT:
 *   This function is intended to be called from profile-receiver.ts
 *   in the handleReceivedWrappedEvent function after unwrapping.
 *
 *   Usage pattern in profile-receiver.ts:
 *     const innerEvent = unwrapEvent(...);
 *     if (innerEvent.kind === 0) {
 *       // Handle profile
 *     } else if (isP2PSignalEvent(innerEvent)) {
 *       await routeP2PSignal(...);
 *     }
 *
 *   Inputs:
 *     - Same as routeP2PSignal
 *
 *   Outputs:
 *     - void
 *
 *   Note: This is a documentation stub. Integration happens by calling
 *   routeP2PSignal from profile-receiver.ts, not by implementing this function.
 */
export function integrateIntoProfileReceiver(): void {
  throw new Error(
    'Integration stub: Call routeP2PSignal from profile-receiver.ts handleReceivedWrappedEvent'
  );
}

/**
 * Integration hook: extend NostlingService.setOnline to trigger P2P attempts
 *
 * CONTRACT:
 *   This function is intended to be called from service.ts
 *   in the setOnline method when transitioning to online=true.
 *
 *   Usage pattern in service.ts:
 *     setOnline(online: boolean) {
 *       this.online = online;
 *       if (online) {
 *         // Existing: flush message queue
 *         await triggerP2PConnectionsOnOnline(...);
 *       }
 *     }
 *
 *   Inputs:
 *     - Same as triggerP2PConnectionsOnOnline
 *
 *   Outputs:
 *     - void
 *
 *   Note: This is a documentation stub. Integration happens by calling
 *   triggerP2PConnectionsOnOnline from service.ts, not by implementing this function.
 */
export function integrateIntoServiceOnline(): void {
  throw new Error(
    'Integration stub: Call triggerP2PConnectionsOnOnline from service.ts setOnline method'
  );
}
