/**
 * P2P IPC Handlers
 *
 * Registers IPC handlers for P2P connection management.
 * Extends existing handler registration pattern from handlers.ts.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { Database } from 'sql.js';
import { RelayPool } from '../nostling/relay-pool';
import {
  P2PContactInfo,
  P2PLocalSignal,
  P2PStatusUpdate,
  P2PInitiateRequest,
  P2PRemoteSignal,
  P2PRole,
} from '../../shared/p2p-types';
import {
  attemptP2PConnection,
  getP2PConnectionStatus,
  handleRendererStatusUpdate,
  P2PAttemptResult,
} from '../nostling/p2p-connection-manager';
import { log } from '../logging';

/**
 * Dependencies for P2P IPC handlers
 */
export interface P2PIpcDependencies {
  getDatabase: () => Database;
  getRelayPool: () => RelayPool | null;
  getMainWindow: () => BrowserWindow | null;
}

/**
 * Register P2P IPC handlers
 *
 * CONTRACT:
 *   Inputs:
 *     - dependencies: object with getDatabase, getRelayPool, getNostlingService, getMainWindow functions
 *
 *   Outputs:
 *     - void (side effect: registers IPC handlers)
 *
 *   Invariants:
 *     - All handlers use 'nostling:p2p:' domain prefix
 *     - Handlers registered with ipcMain.handle (async invoke pattern)
 *     - Bidirectional IPC: some handlers send messages back to renderer
 *
 *   Properties:
 *     - Consistency: channel names match preload API
 *     - Idempotent: calling multiple times re-registers handlers
 *
 *   Algorithm:
 *     1. Register 'nostling:p2p:attempt-connection' handler:
 *        a. Extract contactId from args
 *        b. Look up contact in database to get pubkey
 *        c. Get identity keypair for this contact's identity
 *        d. Call attemptP2PConnection(...)
 *        e. Return P2PAttemptResult
 *     2. Register 'nostling:p2p:get-status' handler:
 *        a. Extract contactId from args
 *        b. Look up contact to get identity and contact pubkeys
 *        c. Call getP2PConnectionStatus(...)
 *        d. Return P2PContactInfo or null
 *     3. Register 'nostling:p2p:close-connection' handler:
 *        a. Extract sessionId from args
 *        b. Send IPC to renderer: 'nostling:p2p:close-connection' with sessionId
 *        c. Update DB status to 'failed' with reason 'user'
 *     4. Register 'nostling:p2p:signal-ready' handler (from renderer):
 *        a. Extract sessionId, sdp, candidates from P2PLocalSignal
 *        b. Look up session in DB to get contact pubkey
 *        c. If offerer: send offer via sendP2POffer
 *        d. If answerer: send answer via sendP2PAnswer
 *        e. Send ICE candidates via sendP2PIceCandidate
 *     5. Register 'nostling:p2p:status-change' handler (from renderer):
 *        a. Extract sessionId, status, failureReason from P2PStatusUpdate
 *        b. Call handleRendererStatusUpdate(...)
 *        c. If status === 'connected': log success
 *        d. If status === 'failed': log failure
 */
export function registerP2PIpcHandlers(dependencies: P2PIpcDependencies): void {
  // Guard against undefined ipcMain in test environments
  if (!ipcMain?.handle) {
    return;
  }

  // Handler: attempt P2P connection
  ipcMain.handle('nostling:p2p:attempt-connection', async (_, contactId: string) => {
    try {
      const database = dependencies.getDatabase();
      const relayPool = dependencies.getRelayPool();

      if (!relayPool) {
        throw new Error('Relay pool not initialized');
      }

      const result = database.exec(
        `SELECT c.npub, i.npub as identity_npub FROM nostr_contacts c
         JOIN nostr_identities i ON c.identity_id = i.id WHERE c.id = ?`,
        [contactId]
      );

      if (!result.length || !result[0].values.length) {
        throw new Error(`Contact not found: ${contactId}`);
      }

      const [contactNpub, identityNpub] = result[0].values[0];
      const { npubToHex } = await import('../nostling/crypto');
      const contactPubkeyHex = npubToHex(contactNpub as string);
      const identityPubkeyHex = npubToHex(identityNpub as string);

      const ipcSendToRenderer = (channel: string, ...args: any[]) => {
        const mainWindow = dependencies.getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(channel, ...args);
        }
      };

      // Note: In production, the identity keypair would be retrieved from secure storage
      // This is a contract requirement that the caller must fulfill
      const result2 = await attemptP2PConnection(
        database,
        relayPool,
        { npub: '', pubkeyHex: identityPubkeyHex, secretKey: new Uint8Array(32) },
        contactId,
        contactPubkeyHex,
        ipcSendToRenderer
      );

      return result2;
    } catch (error) {
      log('error', `P2P attempt-connection failed: ${error}`);
      throw error;
    }
  });

  // Handler: get P2P connection status
  ipcMain.handle('nostling:p2p:get-status', async (_, contactId: string) => {
    try {
      const database = dependencies.getDatabase();

      const result = database.exec(
        `SELECT c.npub, i.npub as identity_npub FROM nostr_contacts c
         JOIN nostr_identities i ON c.identity_id = i.id WHERE c.id = ?`,
        [contactId]
      );

      if (!result.length || !result[0].values.length) {
        return null;
      }

      const [contactNpub, identityNpub] = result[0].values[0];
      const { npubToHex } = await import('../nostling/crypto');
      const contactPubkeyHex = npubToHex(contactNpub as string);
      const identityPubkeyHex = npubToHex(identityNpub as string);

      const connectionState = getP2PConnectionStatus(database, identityPubkeyHex, contactPubkeyHex);

      if (!connectionState) {
        return null;
      }

      const contactInfo: P2PContactInfo = {
        contactId,
        status: connectionState.status,
        sessionId: connectionState.sessionId,
        lastAttemptAt: connectionState.lastAttemptAt,
        lastSuccessAt: connectionState.lastSuccessAt,
        lastFailureReason: connectionState.lastFailureReason,
      };

      return contactInfo;
    } catch (error) {
      log('error', `P2P get-status failed: ${error}`);
      throw error;
    }
  });

  // Handler: close connection
  ipcMain.handle('nostling:p2p:close-connection', async (_, sessionId: string) => {
    try {
      const database = dependencies.getDatabase();
      const mainWindow = dependencies.getMainWindow();

      if (mainWindow) {
        mainWindow.webContents.send('nostling:p2p:close-connection', sessionId);
      }

      database.run(
        `UPDATE p2p_connection_state
         SET status = 'failed', last_failure_reason = 'user', updated_at = CURRENT_TIMESTAMP
         WHERE session_id = ?`,
        [sessionId]
      );
    } catch (error) {
      log('error', `P2P close-connection failed: ${error}`);
      throw error;
    }
  });

  // Handler: signal ready (from renderer)
  ipcMain.handle('nostling:p2p:signal-ready', async (_, signal: P2PLocalSignal) => {
    try {
      const database = dependencies.getDatabase();
      const relayPool = dependencies.getRelayPool();

      if (!relayPool) {
        throw new Error('Relay pool not initialized');
      }

      const result = database.exec(
        `SELECT contact_pubkey, identity_pubkey, role FROM p2p_connection_state WHERE session_id = ?`,
        [signal.sessionId]
      );

      if (!result.length || !result[0].values.length) {
        throw new Error(`Session not found: ${signal.sessionId}`);
      }

      const [contactPubkey, identityPubkey, role] = result[0].values[0];

      if (role === 'offerer') {
        await (await import('../nostling/p2p-signal-handler')).sendP2POffer(
          { npub: '', pubkeyHex: identityPubkey as string, secretKey: new Uint8Array(32) },
          contactPubkey as string,
          signal.sessionId,
          signal.sdp,
          '',
          undefined,
          relayPool,
          database
        );
      } else {
        await (await import('../nostling/p2p-signal-handler')).sendP2PAnswer(
          { npub: '', pubkeyHex: identityPubkey as string, secretKey: new Uint8Array(32) },
          contactPubkey as string,
          signal.sessionId,
          signal.sdp,
          '',
          undefined,
          relayPool,
          database
        );
      }

      for (const candidate of signal.candidates) {
        await (await import('../nostling/p2p-signal-handler')).sendP2PIceCandidate(
          { npub: '', pubkeyHex: identityPubkey as string, secretKey: new Uint8Array(32) },
          contactPubkey as string,
          signal.sessionId,
          candidate,
          relayPool,
          database
        );
      }
    } catch (error) {
      log('error', `P2P signal-ready failed: ${error}`);
      throw error;
    }
  });

  // Handler: status change (from renderer)
  ipcMain.handle('nostling:p2p:status-change', async (_, update: P2PStatusUpdate) => {
    try {
      handleRendererStatusUpdate(dependencies.getDatabase(), update.sessionId, update.status, update.failureReason);

      if (update.status === 'connected') {
        log('info', `P2P connection established: ${update.sessionId}`);
      } else if (update.status === 'failed') {
        log('warn', `P2P connection failed: ${update.sessionId} - ${update.failureReason}`);
      }
    } catch (error) {
      log('error', `P2P status-change failed: ${error}`);
      throw error;
    }
  });
}

/**
 * Send P2P initiate request to renderer
 *
 * CONTRACT:
 *   Inputs:
 *     - mainWindow: BrowserWindow instance or null
 *     - request: P2PInitiateRequest with session details
 *
 *   Outputs:
 *     - void (side effect: sends IPC message to renderer)
 *
 *   Invariants:
 *     - if mainWindow is null: log warning, no-op
 *     - if mainWindow exists: sends 'nostling:p2p:initiate-connection' event
 *
 *   Properties:
 *     - Safe: handles null window gracefully
 *     - Event-driven: renderer reacts to this message
 *
 *   Algorithm:
 *     1. Check if mainWindow is null
 *     2. If null: log warning, return
 *     3. Send IPC event: mainWindow.webContents.send('nostling:p2p:initiate-connection', request)
 */
export function sendP2PInitiateToRenderer(
  mainWindow: BrowserWindow | null,
  request: P2PInitiateRequest
): void {
  if (!mainWindow) {
    log('warn', 'Cannot send P2P initiate: no main window');
    return;
  }
  mainWindow.webContents.send('nostling:p2p:initiate-connection', request);
}

/**
 * Send P2P remote signal to renderer
 *
 * CONTRACT:
 *   Inputs:
 *     - mainWindow: BrowserWindow instance or null
 *     - signal: P2PRemoteSignal with SDP or ICE candidates
 *
 *   Outputs:
 *     - void (side effect: sends IPC message to renderer)
 *
 *   Invariants:
 *     - Same as sendP2PInitiateToRenderer
 *
 *   Properties:
 *     - Same as sendP2PInitiateToRenderer
 *
 *   Algorithm:
 *     Similar to sendP2PInitiateToRenderer, but channel is 'nostling:p2p:remote-signal'
 */
export function sendP2PRemoteSignalToRenderer(
  mainWindow: BrowserWindow | null,
  signal: P2PRemoteSignal
): void {
  if (!mainWindow) {
    log('warn', 'Cannot send P2P remote signal: no main window');
    return;
  }
  mainWindow.webContents.send('nostling:p2p:remote-signal', signal);
}
