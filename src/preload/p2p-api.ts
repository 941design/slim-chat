/**
 * P2P IPC API (Preload)
 *
 * Exposes P2P IPC methods to renderer via contextBridge.
 * To be imported and added to main preload/index.ts API object.
 */

import { ipcRenderer } from 'electron';
import {
  P2PAttemptResult,
  P2PContactInfo,
  P2PInitiateRequest,
  P2PRemoteSignal,
  P2PLocalSignal,
  P2PStatusUpdate,
} from '../shared/p2p-types';

/**
 * P2P API for renderer process
 *
 * CONTRACT:
 *   This object defines the P2P API exposed to renderer via window.api.nostling.p2p.
 *   Each method uses ipcRenderer.invoke for request/response pattern.
 *   Event listeners use ipcRenderer.on for push notifications from main.
 *
 *   Methods:
 *     - attemptConnection(contactId): Initiates P2P connection attempt
 *     - getConnectionStatus(contactId): Retrieves current P2P status
 *     - closeConnection(sessionId): Closes active P2P session
 *
 *   Events (internal to renderer, not exposed via API):
 *     - 'nostling:p2p:initiate-connection': Main → Renderer (start WebRTC)
 *     - 'nostling:p2p:remote-signal': Main → Renderer (apply remote SDP/ICE)
 *     - 'nostling:p2p:close-connection': Main → Renderer (close session)
 *
 *   Note: Event listeners are registered in p2p-webrtc-handler.ts, not here.
 *   This module only exposes the invoke-based API methods.
 */
export const p2pApi = {
  /**
   * Attempt P2P connection with contact
   *
   * CONTRACT:
   *   Inputs:
   *     - contactId: internal contact UUID
   *
   *   Outputs:
   *     - Promise<P2PAttemptResult> with session details and initial status
   *
   *   Algorithm:
   *     1. Invoke IPC: 'nostling:p2p:attempt-connection' with contactId
   *     2. Return result from main process
   */
  async attemptConnection(contactId: string): Promise<P2PAttemptResult> {
    return ipcRenderer.invoke('nostling:p2p:attempt-connection', contactId) as Promise<P2PAttemptResult>;
  },

  /**
   * Get P2P connection status for contact
   *
   * CONTRACT:
   *   Inputs:
   *     - contactId: internal contact UUID
   *
   *   Outputs:
   *     - Promise<P2PContactInfo | null> with current status or null if no state
   *
   *   Algorithm:
   *     1. Invoke IPC: 'nostling:p2p:get-status' with contactId
   *     2. Return result from main process
   */
  async getConnectionStatus(contactId: string): Promise<P2PContactInfo | null> {
    return ipcRenderer.invoke('nostling:p2p:get-status', contactId) as Promise<P2PContactInfo | null>;
  },

  /**
   * Close P2P connection
   *
   * CONTRACT:
   *   Inputs:
   *     - sessionId: session identifier to close
   *
   *   Outputs:
   *     - Promise<void>
   *
   *   Algorithm:
   *     1. Invoke IPC: 'nostling:p2p:close-connection' with sessionId
   *     2. Main process will send event to renderer to close WebRTC
   */
  async closeConnection(sessionId: string): Promise<void> {
    return ipcRenderer.invoke('nostling:p2p:close-connection', sessionId) as Promise<void>;
  },
};

/**
 * Helper function to send local signal to main process
 * (Called by p2p-webrtc-handler.ts when offer/answer is ready)
 *
 * CONTRACT:
 *   Inputs:
 *     - signal: P2PLocalSignal with sessionId, sdp, candidates
 *
 *   Outputs:
 *     - Promise<void>
 *
 *   Algorithm:
 *     1. Invoke IPC: 'nostling:p2p:signal-ready' with signal
 *     2. Main process will send offer/answer to contact via Nostr
 */
export async function sendLocalSignalToMain(signal: P2PLocalSignal): Promise<void> {
  return ipcRenderer.invoke('nostling:p2p:signal-ready', signal) as Promise<void>;
}

/**
 * Helper function to send status update to main process
 * (Called by p2p-webrtc-handler.ts when connection status changes)
 *
 * CONTRACT:
 *   Inputs:
 *     - update: P2PStatusUpdate with sessionId, status, optional failureReason
 *
 *   Outputs:
 *     - Promise<void>
 *
 *   Algorithm:
 *     1. Invoke IPC: 'nostling:p2p:status-change' with update
 *     2. Main process will update database
 */
export async function sendStatusUpdateToMain(update: P2PStatusUpdate): Promise<void> {
  return ipcRenderer.invoke('nostling:p2p:status-change', update) as Promise<void>;
}
