/**
 * P2P RTC Handshake Type Definitions
 *
 * Shared types for direct peer-to-peer WebRTC connectivity.
 * Used across main process, renderer process, and IPC boundary.
 */

/**
 * P2P connection status for a contact
 */
export type P2PConnectionStatus =
  | 'unavailable'  // No global IPv6 detected
  | 'connecting'   // Attempt in progress
  | 'connected'    // Mutual DataChannel established + HELLO/ACK exchanged
  | 'failed';      // Attempt unsuccessful or timed out

/**
 * P2P connection role (deterministic via pubkey ordering)
 */
export type P2PRole = 'offerer' | 'answerer';

/**
 * P2P signaling message version
 */
export const P2P_PROTOCOL_VERSION = 1;

/**
 * Base structure for all P2P signaling messages
 */
interface P2PSignalBase {
  v: typeof P2P_PROTOCOL_VERSION;
  ts: number; // Unix timestamp in seconds
  nonce: string; // Cryptographic nonce for replay protection (32 hex chars)
}

/**
 * P2P capability announcement (optional discovery)
 */
export interface P2PCapabilityMessage extends P2PSignalBase {
  type: 'p2p_cap';
  ipv6: string[];  // Global IPv6 addresses
  udp_port?: number;  // Optional UDP port hint
  features: string[];  // ['webrtc-dc']
  session_hint?: string;  // Base64-encoded random bytes
}

/**
 * WebRTC offer message
 */
export interface P2POfferMessage extends P2PSignalBase {
  type: 'p2p_offer';
  session_id: string;  // Base64-encoded 16 bytes
  from_ipv6: string;
  from_port?: number;
  sdp: string;  // SDP offer
  tie_break?: string;  // For glare resolution
}

/**
 * WebRTC answer message
 */
export interface P2PAnswerMessage extends P2PSignalBase {
  type: 'p2p_answer';
  session_id: string;  // Must match offer
  from_ipv6: string;
  from_port?: number;
  sdp: string;  // SDP answer
}

/**
 * Trickle ICE candidate message
 */
export interface P2PIceMessage extends P2PSignalBase {
  type: 'p2p_ice';
  session_id: string;
  candidate: string;  // ICE candidate string
}

/**
 * Close/abort connection message
 */
export interface P2PCloseMessage extends P2PSignalBase {
  type: 'p2p_close';
  session_id: string;
  reason: 'timeout' | 'user' | 'superseded';
}

/**
 * Union type for all P2P signaling messages
 */
export type P2PSignalMessage =
  | P2PCapabilityMessage
  | P2POfferMessage
  | P2PAnswerMessage
  | P2PIceMessage
  | P2PCloseMessage;

/**
 * P2P connection state (per contact, stored in DB)
 */
export interface P2PConnectionState {
  id: string;  // UUID
  identityPubkey: string;  // Hex
  contactPubkey: string;   // Hex
  status: P2PConnectionStatus;
  sessionId?: string;  // Current/last session ID
  role?: P2PRole;
  lastAttemptAt?: string;  // ISO timestamp
  lastSuccessAt?: string;  // ISO timestamp
  lastFailureReason?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * P2P connection info (returned to renderer via IPC)
 */
export interface P2PContactInfo {
  contactId: string;
  status: P2PConnectionStatus;
  sessionId?: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastFailureReason?: string;
}

/**
 * IPC message: Main → Renderer (initiate connection)
 */
export interface P2PInitiateRequest {
  sessionId: string;
  role: P2PRole;
  contactPubkey: string;  // For debugging
  remoteIpv6?: string;  // If answerer, set from offer
  remoteSdp?: string;   // If answerer, set from offer
  localIpv6: string;    // Our detected IPv6
  localPort?: number;   // Optional port hint
}

/**
 * IPC message: Renderer → Main (local signal ready)
 */
export interface P2PLocalSignal {
  sessionId: string;
  sdp: string;  // Local offer or answer
  candidates: string[];  // ICE candidates
}

/**
 * IPC message: Main → Renderer (remote signal received)
 */
export interface P2PRemoteSignal {
  sessionId: string;
  sdp?: string;  // Remote answer (if we're offerer)
  candidates?: string[];  // Remote ICE candidates
}

/**
 * IPC message: Renderer → Main (connection status change)
 */
export interface P2PStatusUpdate {
  sessionId: string;
  status: P2PConnectionStatus;
  failureReason?: string;
}

/**
 * DataChannel message types
 */
export type P2PDataMessage =
  | { type: 'HELLO'; timestamp: number }
  | { type: 'ACK'; timestamp: number }
  | { type: 'PING'; timestamp: number }
  | { type: 'PONG'; timestamp: number };

/**
 * P2P configuration constants
 */
export const P2P_CONFIG = {
  CONNECTION_TIMEOUT_MS: 12000,  // 12 seconds
  ICE_GATHERING_TIMEOUT_MS: 5000,
  DATACHANNEL_LABEL: 'nostr-p2p',
  HELLO_TIMEOUT_MS: 3000,
  MAX_CANDIDATES: 10,
  MAX_CONCURRENT_CONNECTIONS: 5,  // BUG FIX: Prevent resource exhaustion with 50+ contacts
} as const;

/**
 * Extended contact type with P2P status
 * (extends NostlingContact from shared/types.ts)
 */
export interface NostlingContactWithP2P {
  // All NostlingContact fields...
  id: string;
  identityId: string;
  npub: string;
  alias: string;
  profileName?: string | null;
  state: string;  // NostlingContactState
  createdAt: string;
  lastMessageAt?: string;
  deletedAt?: string;
  profileSource?: 'private_received' | 'public_discovered' | null;
  picture?: string | null;

  // P2P extensions
  p2pStatus?: P2PConnectionStatus;
  p2pSessionId?: string;
  p2pLastAttempt?: string;
  p2pLastSuccess?: string;
  p2pLastFailureReason?: string;
}

/**
 * Result of a P2P connection attempt (returned to renderer via IPC)
 */
export interface P2PAttemptResult {
  contactId: string;
  sessionId: string;
  role: P2PRole;
  status: P2PConnectionStatus;
}
