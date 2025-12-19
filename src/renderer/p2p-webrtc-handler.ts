/**
 * P2P WebRTC DataChannel Handler (Renderer Process)
 *
 * Manages RTCPeerConnection lifecycle, DataChannel creation,
 * and ICE candidate handling for direct peer-to-peer connections.
 */

import {
  P2PConnectionStatus,
  P2PRole,
  P2PInitiateRequest,
  P2PLocalSignal,
  P2PRemoteSignal,
  P2PStatusUpdate,
  P2PDataMessage,
  P2P_CONFIG,
} from '../shared/p2p-types';

/**
 * Active P2P session state
 */
interface P2PSession {
  sessionId: string;
  role: P2PRole;
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  iceQueue: string[];  // Queued remote candidates before remote description set
  connectionTimeout: NodeJS.Timeout | null;
  helloTimeout: NodeJS.Timeout | null;
  status: P2PConnectionStatus;
}

/**
 * Global session registry (in-memory, renderer process)
 */
const activeSessions = new Map<string, P2PSession>();

/**
 * Create RTCPeerConnection with no STUN/TURN servers
 *
 * CONTRACT:
 *   Inputs:
 *     - none
 *
 *   Outputs:
 *     - RTCPeerConnection instance
 *
 *   Invariants:
 *     - iceServers array is empty (no STUN/TURN)
 *     - iceTransportPolicy is 'all' (default)
 *     - configuration is minimal for direct IPv6 only
 *
 *   Properties:
 *     - No external dependencies: only host candidates generated
 *     - Deterministic: same config every time
 *
 *   Algorithm:
 *     1. Create RTCPeerConnection with config:
 *        { iceServers: [], iceTransportPolicy: 'all' }
 *     2. Return instance
 */
export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: [],
    iceTransportPolicy: 'all',
  });
}

/**
 * Create DataChannel on peer connection
 *
 * CONTRACT:
 *   Inputs:
 *     - pc: RTCPeerConnection instance
 *
 *   Outputs:
 *     - RTCDataChannel instance
 *
 *   Invariants:
 *     - label is P2P_CONFIG.DATACHANNEL_LABEL ('nostr-p2p')
 *     - ordered is true (reliable in-order delivery)
 *     - negotiated is false (created by offerer, discovered by answerer)
 *
 *   Properties:
 *     - Deterministic: same label and config every time
 *     - Reliable: ordered delivery guaranteed
 *
 *   Algorithm:
 *     1. Call pc.createDataChannel(label, options)
 *     2. Return channel instance
 */
export function createDataChannel(pc: RTCPeerConnection): RTCDataChannel {
  return pc.createDataChannel(P2P_CONFIG.DATACHANNEL_LABEL, {
    ordered: true,
    negotiated: false,
  });
}

/**
 * Initiate P2P connection as offerer
 *
 * CONTRACT:
 *   Inputs:
 *     - request: P2PInitiateRequest with sessionId, role='offerer', localIpv6
 *     - onLocalSignal: callback function (sdp, candidates) → void
 *     - onStatusChange: callback function (status, failureReason?) → void
 *
 *   Outputs:
 *     - void (side effects: creates session, invokes callbacks)
 *
 *   Invariants:
 *     - session is stored in activeSessions map
 *     - onLocalSignal is called exactly once with offer SDP
 *     - onStatusChange is called when status changes (connecting → connected/failed)
 *     - connection timeout is set for P2P_CONFIG.CONNECTION_TIMEOUT_MS
 *
 *   Properties:
 *     - Callback invocation: onLocalSignal called after offer created
 *     - Timeout enforcement: fails if not connected within timeout
 *     - ICE gathering: collects all host candidates before calling onLocalSignal
 *
 *   Algorithm:
 *     1. Create RTCPeerConnection via createPeerConnection()
 *     2. Create DataChannel via createDataChannel(pc)
 *     3. Set up event listeners:
 *        - pc.onicecandidate: collect candidates
 *        - pc.onconnectionstatechange: track connection state
 *        - dc.onopen: mark connected, send HELLO
 *        - dc.onmessage: handle HELLO/ACK
 *     4. Create offer via pc.createOffer()
 *     5. Set local description via pc.setLocalDescription(offer)
 *     6. Wait for ICE gathering complete or timeout (P2P_CONFIG.ICE_GATHERING_TIMEOUT_MS)
 *     7. Call onLocalSignal(offer.sdp, collectedCandidates)
 *     8. Store session in activeSessions map
 *     9. Set connection timeout:
 *        - After P2P_CONFIG.CONNECTION_TIMEOUT_MS, if not connected: call onStatusChange('failed', 'timeout')
 */
export function initiateAsOfferer(
  request: P2PInitiateRequest,
  onLocalSignal: (sdp: string, candidates: string[]) => void,
  onStatusChange: (status: P2PConnectionStatus, failureReason?: string) => void
): void {
  const { sessionId } = request;
  const pc = createPeerConnection();
  const dc = createDataChannel(pc);
  const collectedCandidates: string[] = [];
  let iceGatheringTimeout: NodeJS.Timeout | null = null;
  let localSignalSent = false;

  const session: P2PSession = {
    sessionId,
    role: 'offerer',
    peerConnection: pc,
    dataChannel: dc,
    iceQueue: [],
    connectionTimeout: null,
    helloTimeout: null,
    status: 'connecting',
  };

  // BUG FIX: Enhanced ICE state logging
  // Root cause: Limited WebRTC error logging prevents troubleshooting connection failures
  // Fix: Add ICE gathering and connection state event handlers
  // Bug report: bug-reports/bug-006-error-logging.md
  // Date: 2025-12-19
  pc.onicegatheringstatechange = () => {
    console.log(`[P2P] ICE gathering state (session ${sessionId}, phase: offer): ${pc.iceGatheringState}`);
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[P2P] ICE connection state (session ${sessionId}, phase: offer): ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === 'failed') {
      console.error(`[P2P] ICE connection failed (session ${sessionId}, phase: offer)`);
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      collectedCandidates.push(event.candidate.candidate);
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      onStatusChange('connected');
      session.status = 'connected';
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      if (session.status !== 'connected') {
        onStatusChange('failed', 'connection failed');
        session.status = 'failed';
      }
    }
  };

  dc.onopen = () => {
    sendHello(dc);
    const helloTimeout = setTimeout(() => {
      if (session.status !== 'connected') {
        onStatusChange('failed', 'HELLO timeout');
        session.status = 'failed';
        closeP2PConnection(sessionId);
      }
    }, P2P_CONFIG.HELLO_TIMEOUT_MS);
    session.helloTimeout = helloTimeout;
  };

  dc.onmessage = (event) => {
    handleDataChannelMessage(session, event.data, onStatusChange);
  };

  // BUG FIX: Enhanced error logging for DataChannel
  // Root cause: Limited WebRTC error logging prevents troubleshooting connection failures
  // Fix: Add error and close handlers to catch DataChannel failures
  // Bug report: bug-reports/bug-006-error-logging.md
  // Date: 2025-12-19
  dc.onerror = (error) => {
    console.error(`[P2P] DataChannel error (session ${sessionId}, phase: offer):`, error);
  };

  dc.onclose = () => {
    console.log(`[P2P] DataChannel closed (session ${sessionId}, phase: offer)`);
  };

  // BUG FIX: Enhanced error logging for WebRTC promise chains
  // Bug report: bug-reports/bug-006-error-logging.md
  // Date: 2025-12-19
  pc.createOffer().then((offer) => {
    pc.setLocalDescription(offer).then(() => {
      iceGatheringTimeout = setTimeout(() => {
        if (!localSignalSent) {
          localSignalSent = true;
          onLocalSignal(offer.sdp || '', collectedCandidates);
          activeSessions.set(sessionId, session);

          session.connectionTimeout = setTimeout(() => {
            if (session.status !== 'connected') {
              onStatusChange('failed', 'timeout');
              session.status = 'failed';
              closeP2PConnection(sessionId);
            }
          }, P2P_CONFIG.CONNECTION_TIMEOUT_MS);
        }
      }, P2P_CONFIG.ICE_GATHERING_TIMEOUT_MS);
    }).catch((error) => {
      console.error(`[P2P] setLocalDescription failed (session ${sessionId}, phase: offer):`, error);
      onStatusChange('failed', `setLocalDescription error: ${error.message}`);
      closeP2PConnection(sessionId);
    });
  }).catch((error) => {
    console.error(`[P2P] createOffer failed (session ${sessionId}, phase: offer):`, error);
    onStatusChange('failed', `createOffer error: ${error.message}`);
    closeP2PConnection(sessionId);
  });
}

/**
 * Initiate P2P connection as answerer
 *
 * CONTRACT:
 *   Inputs:
 *     - request: P2PInitiateRequest with sessionId, role='answerer', remoteSdp, remoteIpv6
 *     - onLocalSignal: callback function (sdp, candidates) → void
 *     - onStatusChange: callback function (status, failureReason?) → void
 *
 *   Outputs:
 *     - void (side effects: creates session, invokes callbacks)
 *
 *   Invariants:
 *     - session is stored in activeSessions map
 *     - onLocalSignal is called exactly once with answer SDP
 *     - onStatusChange is called when status changes
 *     - remote offer is set before creating answer
 *
 *   Properties:
 *     - Same callback and timeout properties as initiateAsOfferer
 *     - Remote description set before local answer created
 *
 *   Algorithm:
 *     Similar to initiateAsOfferer, but:
 *     1. Create RTCPeerConnection (no DataChannel - answerer receives it)
 *     2. Set remote description from request.remoteSdp
 *     3. Create answer via pc.createAnswer()
 *     4. Set local description via pc.setLocalDescription(answer)
 *     5. Wait for ICE gathering
 *     6. Call onLocalSignal(answer.sdp, collectedCandidates)
 *     7. Set up same event listeners (dc will be received via ondatachannel)
 *     8. Set connection timeout
 */
export function initiateAsAnswerer(
  request: P2PInitiateRequest,
  onLocalSignal: (sdp: string, candidates: string[]) => void,
  onStatusChange: (status: P2PConnectionStatus, failureReason?: string) => void
): void {
  const { sessionId, remoteSdp } = request;
  const pc = createPeerConnection();
  const collectedCandidates: string[] = [];
  let iceGatheringTimeout: NodeJS.Timeout | null = null;
  let localSignalSent = false;

  const session: P2PSession = {
    sessionId,
    role: 'answerer',
    peerConnection: pc,
    dataChannel: null,
    iceQueue: [],
    connectionTimeout: null,
    helloTimeout: null,
    status: 'connecting',
  };

  // BUG FIX: Enhanced ICE state logging (answerer)
  // Bug report: bug-reports/bug-006-error-logging.md
  // Date: 2025-12-19
  pc.onicegatheringstatechange = () => {
    console.log(`[P2P] ICE gathering state (session ${sessionId}, phase: answer): ${pc.iceGatheringState}`);
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[P2P] ICE connection state (session ${sessionId}, phase: answer): ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === 'failed') {
      console.error(`[P2P] ICE connection failed (session ${sessionId}, phase: answer)`);
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      collectedCandidates.push(event.candidate.candidate);
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      onStatusChange('connected');
      session.status = 'connected';
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      if (session.status !== 'connected') {
        onStatusChange('failed', 'connection failed');
        session.status = 'failed';
      }
    }
  };

  pc.ondatachannel = (event) => {
    const dc = event.channel;
    session.dataChannel = dc;

    dc.onopen = () => {
      sendAck(dc);
      const helloTimeout = setTimeout(() => {
        if (session.status !== 'connected') {
          onStatusChange('failed', 'HELLO timeout');
          session.status = 'failed';
          closeP2PConnection(sessionId);
        }
      }, P2P_CONFIG.HELLO_TIMEOUT_MS);
      session.helloTimeout = helloTimeout;
    };

    dc.onmessage = (messageEvent) => {
      handleDataChannelMessage(session, messageEvent.data, onStatusChange);
    };

    // BUG FIX: Enhanced error logging for DataChannel (answerer)
    // Bug report: bug-reports/bug-006-error-logging.md
    // Date: 2025-12-19
    dc.onerror = (error) => {
      console.error(`[P2P] DataChannel error (session ${sessionId}, phase: answer):`, error);
    };

    dc.onclose = () => {
      console.log(`[P2P] DataChannel closed (session ${sessionId}, phase: answer)`);
    };
  };

  const remoteDescription = new RTCSessionDescription({ type: 'offer', sdp: remoteSdp! });
  // BUG FIX: Enhanced error logging for WebRTC promise chains (answerer)
  // Bug report: bug-reports/bug-006-error-logging.md
  // Date: 2025-12-19
  pc.setRemoteDescription(remoteDescription).then(() => {
    pc.createAnswer().then((answer) => {
      pc.setLocalDescription(answer).then(() => {
        iceGatheringTimeout = setTimeout(() => {
          if (!localSignalSent) {
            localSignalSent = true;
            onLocalSignal(answer.sdp || '', collectedCandidates);
            activeSessions.set(sessionId, session);

            session.connectionTimeout = setTimeout(() => {
              if (session.status !== 'connected') {
                onStatusChange('failed', 'timeout');
                session.status = 'failed';
                closeP2PConnection(sessionId);
              }
            }, P2P_CONFIG.CONNECTION_TIMEOUT_MS);
          }
        }, P2P_CONFIG.ICE_GATHERING_TIMEOUT_MS);
      }).catch((error) => {
        console.error(`[P2P] setLocalDescription failed (session ${sessionId}, phase: answer):`, error);
        onStatusChange('failed', `setLocalDescription error: ${error.message}`);
        closeP2PConnection(sessionId);
      });
    }).catch((error) => {
      console.error(`[P2P] createAnswer failed (session ${sessionId}, phase: answer):`, error);
      onStatusChange('failed', `createAnswer error: ${error.message}`);
      closeP2PConnection(sessionId);
    });
  }).catch((error) => {
    console.error(`[P2P] setRemoteDescription failed (session ${sessionId}, phase: answer):`, error);
    onStatusChange('failed', `setRemoteDescription error: ${error.message}`);
    closeP2PConnection(sessionId);
  });
}

/**
 * Handle remote signal (answer SDP or ICE candidates)
 *
 * CONTRACT:
 *   Inputs:
 *     - sessionId: session identifier
 *     - signal: P2PRemoteSignal with optional sdp or candidates
 *
 *   Outputs:
 *     - void (side effect: updates RTCPeerConnection)
 *
 *   Invariants:
 *     - session must exist in activeSessions
 *     - if signal.sdp is set: sets remote description (answerer SDP for offerer)
 *     - if signal.candidates is set: adds ICE candidates to peer connection
 *     - queued candidates are added after remote description is set
 *
 *   Properties:
 *     - Order independence: candidates can arrive before or after SDP
 *     - Queue mechanism: candidates arriving before SDP are queued
 *     - Idempotent: adding same candidate multiple times is safe (WebRTC handles duplicates)
 *
 *   Algorithm:
 *     1. Look up session by sessionId in activeSessions
 *     2. If signal.sdp is set:
 *        a. Create RTCSessionDescription from SDP
 *        b. Call pc.setRemoteDescription(description)
 *        c. Drain queued candidates via pc.addIceCandidate()
 *     3. If signal.candidates is set:
 *        a. For each candidate string:
 *           - If remote description set: call pc.addIceCandidate()
 *           - If no remote description: add to iceQueue
 */
export function handleRemoteSignal(sessionId: string, signal: P2PRemoteSignal): void {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return;
  }

  const { peerConnection, iceQueue } = session;

  if (signal.sdp) {
    const remoteDescription = new RTCSessionDescription({ type: session.role === 'offerer' ? 'answer' : 'offer', sdp: signal.sdp });
    peerConnection.setRemoteDescription(remoteDescription).then(() => {
      for (const candidateStr of iceQueue) {
        peerConnection.addIceCandidate(new RTCIceCandidate({ candidate: candidateStr }));
      }
      iceQueue.length = 0;
    });
  }

  if (signal.candidates) {
    for (const candidateStr of signal.candidates) {
      if (peerConnection.remoteDescription) {
        peerConnection.addIceCandidate(new RTCIceCandidate({ candidate: candidateStr }));
      } else {
        iceQueue.push(candidateStr);
      }
    }
  }
}

/**
 * Close P2P connection for session
 *
 * CONTRACT:
 *   Inputs:
 *     - sessionId: session identifier to close
 *
 *   Outputs:
 *     - void (side effects: closes connection, removes session)
 *
 *   Invariants:
 *     - RTCPeerConnection is closed
 *     - DataChannel is closed (if open)
 *     - All timeouts are cleared
 *     - Session is removed from activeSessions map
 *
 *   Properties:
 *     - Idempotent: closing non-existent session is no-op
 *     - Cleanup: all resources released
 *
 *   Algorithm:
 *     1. Look up session by sessionId
 *     2. If not found: return (idempotent)
 *     3. Clear connection timeout if set
 *     4. Clear HELLO timeout if set
 *     5. Close DataChannel if exists
 *     6. Close RTCPeerConnection
 *     7. Remove session from activeSessions map
 */
export function closeP2PConnection(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return;
  }

  if (session.connectionTimeout) {
    clearTimeout(session.connectionTimeout);
  }

  if (session.helloTimeout) {
    clearTimeout(session.helloTimeout);
  }

  if (session.dataChannel && session.dataChannel.readyState === 'open') {
    session.dataChannel.close();
  }

  session.peerConnection.close();
  activeSessions.delete(sessionId);
}

/**
 * Send HELLO message over DataChannel
 *
 * CONTRACT:
 *   Inputs:
 *     - dataChannel: open RTCDataChannel instance
 *
 *   Outputs:
 *     - void (side effect: sends message)
 *
 *   Invariants:
 *     - dataChannel.readyState === 'open'
 *     - message is JSON-serialized P2PDataMessage with type='HELLO'
 *
 *   Properties:
 *     - Precondition: channel must be open (throw if not)
 *     - Message format: { type: 'HELLO', timestamp: currentTimeMs }
 *
 *   Algorithm:
 *     1. Verify dataChannel.readyState === 'open' (throw if not)
 *     2. Create message object: { type: 'HELLO', timestamp: Date.now() }
 *     3. Serialize to JSON
 *     4. Send via dataChannel.send(json)
 */
export function sendHello(dataChannel: RTCDataChannel): void {
  if (dataChannel.readyState !== 'open') {
    throw new Error('Cannot send HELLO: DataChannel not open');
  }
  const message: P2PDataMessage = { type: 'HELLO', timestamp: Date.now() };
  dataChannel.send(JSON.stringify(message));
}

/**
 * Send ACK message over DataChannel
 *
 * CONTRACT:
 *   Inputs:
 *     - dataChannel: open RTCDataChannel instance
 *
 *   Outputs:
 *     - void (side effect: sends message)
 *
 *   Invariants:
 *     - Same as sendHello, but type='ACK'
 *
 *   Properties:
 *     - Same as sendHello
 *
 *   Algorithm:
 *     Similar to sendHello, but message type is 'ACK'
 */
export function sendAck(dataChannel: RTCDataChannel): void {
  if (dataChannel.readyState !== 'open') {
    throw new Error('Cannot send ACK: DataChannel not open');
  }
  const message: P2PDataMessage = { type: 'ACK', timestamp: Date.now() };
  dataChannel.send(JSON.stringify(message));
}

/**
 * Handle DataChannel message (HELLO/ACK/PING/PONG)
 *
 * CONTRACT:
 *   Inputs:
 *     - session: P2PSession instance
 *     - messageData: string (JSON from DataChannel)
 *     - onStatusChange: callback function (status, failureReason?) → void
 *
 *   Outputs:
 *     - void (side effects: sends replies, updates status)
 *
 *   Invariants:
 *     - if message type is HELLO: send ACK
 *     - if message type is ACK: mark session as fully connected
 *     - if message type is PING: send PONG
 *     - if message type is PONG: log (keep-alive)
 *
 *   Properties:
 *     - Handshake completion: HELLO → ACK confirms mutual connectivity
 *     - Keep-alive: PING/PONG for future connection health checks
 *
 *   Algorithm:
 *     1. Parse messageData as JSON → P2PDataMessage
 *     2. If type === 'HELLO':
 *        a. Send ACK via session.dataChannel
 *        b. Call onStatusChange('connected')
 *        c. Clear HELLO timeout
 *     3. If type === 'ACK':
 *        a. Call onStatusChange('connected')
 *        b. Clear HELLO timeout
 *     4. If type === 'PING':
 *        a. Send PONG
 *     5. If type === 'PONG':
 *        a. Log receipt (future: update last-seen timestamp)
 */
export function handleDataChannelMessage(
  session: P2PSession,
  messageData: string,
  onStatusChange: (status: P2PConnectionStatus, failureReason?: string) => void
): void {
  const message: P2PDataMessage = JSON.parse(messageData);

  switch (message.type) {
    case 'HELLO':
      if (session.dataChannel) {
        sendAck(session.dataChannel);
      }
      onStatusChange('connected');
      if (session.helloTimeout) {
        clearTimeout(session.helloTimeout);
        session.helloTimeout = null;
      }
      break;

    case 'ACK':
      onStatusChange('connected');
      if (session.helloTimeout) {
        clearTimeout(session.helloTimeout);
        session.helloTimeout = null;
      }
      break;

    case 'PING':
      if (session.dataChannel) {
        const pongMessage: P2PDataMessage = { type: 'PONG', timestamp: Date.now() };
        session.dataChannel.send(JSON.stringify(pongMessage));
      }
      break;

    case 'PONG':
      break;
  }
}

/**
 * Initialize P2P WebRTC handler (register IPC listeners)
 *
 * CONTRACT:
 *   Inputs:
 *     - none (accesses global window.api from preload)
 *
 *   Outputs:
 *     - void (side effect: registers IPC event listeners)
 *
 *   Invariants:
 *     - listens for 'nostling:p2p:initiate-connection' from main
 *     - listens for 'nostling:p2p:remote-signal' from main
 *     - listens for 'nostling:p2p:close-connection' from main
 *     - sends 'nostling:p2p:signal-ready' to main when local signal ready
 *     - sends 'nostling:p2p:status-change' to main when status changes
 *
 *   Properties:
 *     - Bidirectional IPC: main ↔ renderer coordination
 *     - Event-driven: reacts to IPC messages asynchronously
 *
 *   Algorithm:
 *     1. Register listener for 'nostling:p2p:initiate-connection':
 *        a. Parse P2PInitiateRequest
 *        b. If role === 'offerer': call initiateAsOfferer()
 *        c. If role === 'answerer': call initiateAsAnswerer()
 *        d. On local signal ready: send 'nostling:p2p:signal-ready' to main
 *        e. On status change: send 'nostling:p2p:status-change' to main
 *     2. Register listener for 'nostling:p2p:remote-signal':
 *        a. Parse P2PRemoteSignal
 *        b. Call handleRemoteSignal(sessionId, signal)
 *     3. Register listener for 'nostling:p2p:close-connection':
 *        a. Parse sessionId
 *        b. Call closeP2PConnection(sessionId)
 */
export function initializeP2PHandler(): void {
  const { ipcRenderer } = window.require('electron');
  const { sendLocalSignalToMain, sendStatusUpdateToMain } = window.require('../preload/p2p-api');

  ipcRenderer.on('nostling:p2p:initiate-connection', (event: unknown, request: P2PInitiateRequest) => {
    const onLocalSignal = async (sdp: string, candidates: string[]) => {
      const signal: P2PLocalSignal = { sessionId: request.sessionId, sdp, candidates };
      await sendLocalSignalToMain(signal);
    };

    const onStatusChange = async (status: P2PConnectionStatus, failureReason?: string) => {
      const update: P2PStatusUpdate = { sessionId: request.sessionId, status, failureReason };
      await sendStatusUpdateToMain(update);
    };

    if (request.role === 'offerer') {
      initiateAsOfferer(request, onLocalSignal, onStatusChange);
    } else if (request.role === 'answerer') {
      initiateAsAnswerer(request, onLocalSignal, onStatusChange);
    }
  });

  ipcRenderer.on('nostling:p2p:remote-signal', (event: unknown, sessionId: string, signal: P2PRemoteSignal) => {
    handleRemoteSignal(sessionId, signal);
  });

  ipcRenderer.on('nostling:p2p:close-connection', (event: unknown, sessionId: string) => {
    closeP2PConnection(sessionId);
  });
}
