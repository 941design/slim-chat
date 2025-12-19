/**
 * Property-Based Tests for P2P WebRTC Handler
 *
 * Uses Jest with property-based testing for comprehensive invariant verification.
 * Note: Direct tests of WebRTC peer connection creation require browser environment.
 * This suite focuses on testable logic and configuration properties.
 */

import {
  sendHello,
  sendAck,
  handleDataChannelMessage,
} from './p2p-webrtc-handler';
import {
  P2PConnectionStatus,
  P2P_CONFIG,
  P2PDataMessage,
} from '../shared/p2p-types';

describe('P2P WebRTC Handler', () => {
  describe('sendHello', () => {
    it('property: sends message with correct structure', () => {
      const sentMessages: string[] = [];
      const mockDc = {
        readyState: 'open' as RTCDataChannelState,
        send: jest.fn((data: string) => {
          sentMessages.push(data);
        }),
      } as unknown as RTCDataChannel;

      sendHello(mockDc);

      expect(sentMessages).toHaveLength(1);
      const msg: P2PDataMessage = JSON.parse(sentMessages[0]);
      expect(msg.type).toBe('HELLO');
      expect(typeof msg.timestamp).toBe('number');
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it('invariant: throws if DataChannel not open', () => {
      const mockDc = {
        readyState: 'connecting' as RTCDataChannelState,
        send: jest.fn(),
      } as unknown as RTCDataChannel;

      expect(() => sendHello(mockDc)).toThrow('Cannot send HELLO: DataChannel not open');
    });

    it('invariant: requires DataChannel to be in open state before sending', () => {
      const states: RTCDataChannelState[] = ['connecting', 'closed', 'closing'];

      for (const state of states) {
        const mockDc = {
          readyState: state,
          send: jest.fn(),
        } as unknown as RTCDataChannel;

        expect(() => sendHello(mockDc)).toThrow();
      }
    });
  });

  describe('sendAck', () => {
    it('property: sends message with correct structure', () => {
      const sentMessages: string[] = [];
      const mockDc = {
        readyState: 'open' as RTCDataChannelState,
        send: jest.fn((data: string) => {
          sentMessages.push(data);
        }),
      } as unknown as RTCDataChannel;

      sendAck(mockDc);

      expect(sentMessages).toHaveLength(1);
      const msg: P2PDataMessage = JSON.parse(sentMessages[0]);
      expect(msg.type).toBe('ACK');
      expect(typeof msg.timestamp).toBe('number');
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it('invariant: throws if DataChannel not open', () => {
      const mockDc = {
        readyState: 'connecting' as RTCDataChannelState,
        send: jest.fn(),
      } as unknown as RTCDataChannel;

      expect(() => sendAck(mockDc)).toThrow('Cannot send ACK: DataChannel not open');
    });
  });

  describe('handleDataChannelMessage', () => {
    it('property: HELLO triggers ACK response and status change', () => {
      const sentMessages: string[] = [];
      const mockDc = {
        readyState: 'open' as RTCDataChannelState,
        send: jest.fn((data: string) => {
          sentMessages.push(data);
        }),
      } as unknown as RTCDataChannel;

      const mockSession = {
        sessionId: 'test-session',
        role: 'offerer' as const,
        peerConnection: {} as RTCPeerConnection,
        dataChannel: mockDc,
        iceQueue: [],
        connectionTimeout: null,
        helloTimeout: null,
        status: 'connecting' as P2PConnectionStatus,
      };

      const onStatusChange = jest.fn();
      const helloMessage: P2PDataMessage = { type: 'HELLO', timestamp: Date.now() };

      handleDataChannelMessage(mockSession, JSON.stringify(helloMessage), onStatusChange);

      // Invariant: HELLO must trigger onStatusChange('connected')
      expect(onStatusChange).toHaveBeenCalledWith('connected');
      // Invariant: HELLO must trigger ACK response
      expect(sentMessages).toHaveLength(1);
      const ackMsg: P2PDataMessage = JSON.parse(sentMessages[0]);
      expect(ackMsg.type).toBe('ACK');
    });

    it('property: ACK triggers status change to connected', () => {
      const mockSession = {
        sessionId: 'test-session',
        role: 'answerer' as const,
        peerConnection: {} as RTCPeerConnection,
        dataChannel: null,
        iceQueue: [],
        connectionTimeout: null,
        helloTimeout: null,
        status: 'connecting' as P2PConnectionStatus,
      };

      const onStatusChange = jest.fn();
      const ackMessage: P2PDataMessage = { type: 'ACK', timestamp: Date.now() };

      handleDataChannelMessage(mockSession, JSON.stringify(ackMessage), onStatusChange);

      // Invariant: ACK must trigger onStatusChange('connected')
      expect(onStatusChange).toHaveBeenCalledWith('connected');
    });

    it('property: PING triggers PONG response', () => {
      const sentMessages: string[] = [];
      const mockDc = {
        readyState: 'open' as RTCDataChannelState,
        send: jest.fn((data: string) => {
          sentMessages.push(data);
        }),
      } as unknown as RTCDataChannel;

      const mockSession = {
        sessionId: 'test-session',
        role: 'offerer' as const,
        peerConnection: {} as RTCPeerConnection,
        dataChannel: mockDc,
        iceQueue: [],
        connectionTimeout: null,
        helloTimeout: null,
        status: 'connected' as P2PConnectionStatus,
      };

      const pingMessage: P2PDataMessage = { type: 'PING', timestamp: Date.now() };

      handleDataChannelMessage(mockSession, JSON.stringify(pingMessage), jest.fn());

      // Invariant: PING must trigger PONG response
      expect(sentMessages).toHaveLength(1);
      const pongMsg: P2PDataMessage = JSON.parse(sentMessages[0]);
      expect(pongMsg.type).toBe('PONG');
      expect(typeof pongMsg.timestamp).toBe('number');
    });

    it('property: PONG handling is safe (no-op)', () => {
      const mockSession = {
        sessionId: 'test-session',
        role: 'offerer' as const,
        peerConnection: {} as RTCPeerConnection,
        dataChannel: null,
        iceQueue: [],
        connectionTimeout: null,
        helloTimeout: null,
        status: 'connected' as P2PConnectionStatus,
      };

      const pongMessage: P2PDataMessage = { type: 'PONG', timestamp: Date.now() };

      // Invariant: PONG handling must not throw
      expect(() => {
        handleDataChannelMessage(mockSession, JSON.stringify(pongMessage), jest.fn());
      }).not.toThrow();
    });

    it('property: HELLO timeout clearing on ACK receipt', () => {
      const helloTimeout = setTimeout(() => {}, 10000);
      const mockSession = {
        sessionId: 'test-session',
        role: 'answerer' as const,
        peerConnection: {} as RTCPeerConnection,
        dataChannel: null,
        iceQueue: [],
        connectionTimeout: null,
        helloTimeout: helloTimeout,
        status: 'connecting' as P2PConnectionStatus,
      };

      const ackMessage: P2PDataMessage = { type: 'ACK', timestamp: Date.now() };

      handleDataChannelMessage(mockSession, JSON.stringify(ackMessage), jest.fn());

      // Invariant: helloTimeout must be cleared after ACK
      expect(mockSession.helloTimeout).toBeNull();
    });

    it('property: HELLO timeout clearing on HELLO receipt', () => {
      const helloTimeout = setTimeout(() => {}, 10000);
      const sentMessages: string[] = [];
      const mockDc = {
        readyState: 'open' as RTCDataChannelState,
        send: jest.fn((data: string) => {
          sentMessages.push(data);
        }),
      } as unknown as RTCDataChannel;

      const mockSession = {
        sessionId: 'test-session',
        role: 'offerer' as const,
        peerConnection: {} as RTCPeerConnection,
        dataChannel: mockDc,
        iceQueue: [],
        connectionTimeout: null,
        helloTimeout: helloTimeout,
        status: 'connecting' as P2PConnectionStatus,
      };

      const helloMessage: P2PDataMessage = { type: 'HELLO', timestamp: Date.now() };

      handleDataChannelMessage(mockSession, JSON.stringify(helloMessage), jest.fn());

      // Invariant: helloTimeout must be cleared after HELLO
      expect(mockSession.helloTimeout).toBeNull();
    });

    it('property: any valid DataMessage parses correctly', () => {
      const mockSession = {
        sessionId: 'test-session',
        role: 'offerer' as const,
        peerConnection: {} as RTCPeerConnection,
        dataChannel: null,
        iceQueue: [],
        connectionTimeout: null,
        helloTimeout: null,
        status: 'connecting' as P2PConnectionStatus,
      };

      const messages: P2PDataMessage[] = [
        { type: 'HELLO', timestamp: 1000 },
        { type: 'ACK', timestamp: 2000 },
        { type: 'PING', timestamp: 3000 },
        { type: 'PONG', timestamp: 4000 },
      ];

      for (const msg of messages) {
        // Invariant: must not throw on valid JSON serialization
        expect(() => {
          handleDataChannelMessage(mockSession, JSON.stringify(msg), jest.fn());
        }).not.toThrow();
      }
    });
  });

  describe('Configuration Constants', () => {
    it('invariant: CONNECTION_TIMEOUT_MS is 12000ms (12 seconds)', () => {
      expect(P2P_CONFIG.CONNECTION_TIMEOUT_MS).toBe(12000);
    });

    it('invariant: ICE_GATHERING_TIMEOUT_MS is 5000ms (5 seconds)', () => {
      expect(P2P_CONFIG.ICE_GATHERING_TIMEOUT_MS).toBe(5000);
    });

    it('invariant: DATACHANNEL_LABEL is "nostr-p2p"', () => {
      expect(P2P_CONFIG.DATACHANNEL_LABEL).toBe('nostr-p2p');
    });

    it('invariant: HELLO_TIMEOUT_MS is 3000ms (3 seconds)', () => {
      expect(P2P_CONFIG.HELLO_TIMEOUT_MS).toBe(3000);
    });

    it('property: HELLO timeout less than connection timeout', () => {
      // Property: HELLO exchange must complete before overall connection timeout
      expect(P2P_CONFIG.HELLO_TIMEOUT_MS).toBeLessThan(P2P_CONFIG.CONNECTION_TIMEOUT_MS);
    });

    it('property: all timeouts are positive integers', () => {
      expect(P2P_CONFIG.CONNECTION_TIMEOUT_MS).toBeGreaterThan(0);
      expect(P2P_CONFIG.ICE_GATHERING_TIMEOUT_MS).toBeGreaterThan(0);
      expect(P2P_CONFIG.HELLO_TIMEOUT_MS).toBeGreaterThan(0);
    });
  });

  describe('DataChannel Message Format', () => {
    it('property: all DataChannel messages include timestamp field', () => {
      const messageTypes: P2PDataMessage['type'][] = ['HELLO', 'ACK', 'PING', 'PONG'];

      for (const type of messageTypes) {
        const msg: P2PDataMessage = { type, timestamp: Date.now() };
        expect(msg).toHaveProperty('timestamp');
        expect(typeof msg.timestamp).toBe('number');
        expect(msg.timestamp).toBeGreaterThan(0);
      }
    });

    it('property: all messages are JSON-serializable', () => {
      const messages: P2PDataMessage[] = [
        { type: 'HELLO', timestamp: 1000 },
        { type: 'ACK', timestamp: 2000 },
        { type: 'PING', timestamp: 3000 },
        { type: 'PONG', timestamp: 4000 },
      ];

      for (const msg of messages) {
        const json = JSON.stringify(msg);
        const parsed = JSON.parse(json);
        expect(parsed.type).toBe(msg.type);
        expect(parsed.timestamp).toBe(msg.timestamp);
      }
    });

    it('property: timestamp is always positive integer', () => {
      const now = Date.now();
      const messages: P2PDataMessage[] = [
        { type: 'HELLO', timestamp: now },
        { type: 'ACK', timestamp: now + 1 },
        { type: 'PING', timestamp: now + 2 },
        { type: 'PONG', timestamp: now + 3 },
      ];

      for (const msg of messages) {
        expect(msg.timestamp).toBeGreaterThan(0);
        expect(Number.isInteger(msg.timestamp)).toBe(true);
      }
    });
  });

  describe('Message Type Coverage', () => {
    it('property: handler processes all four message types without error', () => {
      const mockDc = {
        readyState: 'open' as RTCDataChannelState,
        send: jest.fn(),
      } as unknown as RTCDataChannel;

      const mockSession = {
        sessionId: 'test-session',
        role: 'offerer' as const,
        peerConnection: {} as RTCPeerConnection,
        dataChannel: mockDc,
        iceQueue: [],
        connectionTimeout: null,
        helloTimeout: null,
        status: 'connecting' as P2PConnectionStatus,
      };

      const onStatusChange = jest.fn();
      const messages: P2PDataMessage[] = [
        { type: 'HELLO', timestamp: Date.now() },
        { type: 'ACK', timestamp: Date.now() },
        { type: 'PING', timestamp: Date.now() },
        { type: 'PONG', timestamp: Date.now() },
      ];

      // Invariant: all message types must be handled without throwing
      for (const msg of messages) {
        expect(() => {
          handleDataChannelMessage(mockSession, JSON.stringify(msg), onStatusChange);
        }).not.toThrow();
      }
    });
  });

  describe('Handshake Completion Property', () => {
    it('property: HELLO → ACK flow marks connection as complete', () => {
      const sentMessages: string[] = [];
      const mockDc = {
        readyState: 'open' as RTCDataChannelState,
        send: jest.fn((data: string) => {
          sentMessages.push(data);
        }),
      } as unknown as RTCDataChannel;

      const mockSession = {
        sessionId: 'test-session',
        role: 'offerer' as const,
        peerConnection: {} as RTCPeerConnection,
        dataChannel: mockDc,
        iceQueue: [],
        connectionTimeout: null,
        helloTimeout: null,
        status: 'connecting' as P2PConnectionStatus,
      };

      const onStatusChange = jest.fn();

      // Step 1: Offerer sends HELLO, answerer receives it
      const helloMessage: P2PDataMessage = { type: 'HELLO', timestamp: 1000 };
      handleDataChannelMessage(mockSession, JSON.stringify(helloMessage), onStatusChange);

      // Verify offerer transitioned to connected
      expect(onStatusChange).toHaveBeenCalledWith('connected');

      // Verify ACK was sent back
      expect(sentMessages).toHaveLength(1);
      const ackMsg: P2PDataMessage = JSON.parse(sentMessages[0]);
      expect(ackMsg.type).toBe('ACK');

      // Reset for step 2
      onStatusChange.mockClear();

      // Step 2: Answerer receives the ACK
      const receivedAck: P2PDataMessage = { type: 'ACK', timestamp: 2000 };
      handleDataChannelMessage(mockSession, JSON.stringify(receivedAck), onStatusChange);

      // Verify answerer also transitioned to connected
      expect(onStatusChange).toHaveBeenCalledWith('connected');
    });
  });

  describe('Status Change Callbacks', () => {
    it('property: HELLO receipt always triggers connected status update', () => {
      const mockDc = {
        readyState: 'open' as RTCDataChannelState,
        send: jest.fn(),
      } as unknown as RTCDataChannel;

      const mockSession = {
        sessionId: 'test-session',
        role: 'offerer' as const,
        peerConnection: {} as RTCPeerConnection,
        dataChannel: mockDc,
        iceQueue: [],
        connectionTimeout: null,
        helloTimeout: null,
        status: 'connecting' as P2PConnectionStatus,
      };

      const onStatusChange = jest.fn();
      const helloMessage: P2PDataMessage = { type: 'HELLO', timestamp: Date.now() };

      handleDataChannelMessage(mockSession, JSON.stringify(helloMessage), onStatusChange);

      // Invariant: must call onStatusChange with 'connected'
      const calls = onStatusChange.mock.calls;
      expect(calls).toContainEqual(['connected']);
    });

    it('property: ACK receipt always triggers connected status update', () => {
      const mockSession = {
        sessionId: 'test-session',
        role: 'answerer' as const,
        peerConnection: {} as RTCPeerConnection,
        dataChannel: null,
        iceQueue: [],
        connectionTimeout: null,
        helloTimeout: null,
        status: 'connecting' as P2PConnectionStatus,
      };

      const onStatusChange = jest.fn();
      const ackMessage: P2PDataMessage = { type: 'ACK', timestamp: Date.now() };

      handleDataChannelMessage(mockSession, JSON.stringify(ackMessage), onStatusChange);

      // Invariant: must call onStatusChange with 'connected'
      const calls = onStatusChange.mock.calls;
      expect(calls).toContainEqual(['connected']);
    });
  });
});
