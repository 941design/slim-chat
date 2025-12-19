/**
 * Property-Based Tests for P2P Signal Handler
 *
 * Tests NIP-59 wrapping, signal validation, relay publishing, and DB state tracking.
 * Uses fast-check for comprehensive property-based test coverage.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.mock('../logging', () => ({
  log: jest.fn(),
}));

import * as fc from 'fast-check';
import initSqlJs, { Database } from 'sql.js';
import { randomBytes } from 'crypto';
import {
  sendP2POffer,
  sendP2PAnswer,
  sendP2PIceCandidate,
  sendP2PClose,
  parseP2PSignal,
  P2PSignalSendResult,
} from './p2p-signal-handler';
import { NostrKeypair, NostrEvent, generateKeypair } from './crypto';
import { P2PSignalMessage, P2P_PROTOCOL_VERSION } from '../../shared/p2p-types';
import { PublishResult } from './relay-pool';
import { finalizeEvent } from 'nostr-tools/pure';

// ============================================================================
// Test Database Setup
// ============================================================================

async function createTestDatabase(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE p2p_processed_signals (
      session_id TEXT NOT NULL,
      nonce TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      PRIMARY KEY (session_id, nonce)
    )
  `);

  db.run(`
    CREATE TABLE p2p_signal_send_state (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      identity_pubkey TEXT NOT NULL,
      contact_pubkey TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      signal_hash TEXT,
      event_id TEXT,
      last_attempt_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      UNIQUE(session_id, identity_pubkey, contact_pubkey, signal_type, signal_hash)
    )
  `);

  return db;
}

// ============================================================================
// Mock Relay Pool
// ============================================================================

class MockRelayPool {
  public publishedEvents: NostrEvent[] = [];
  public shouldSucceed: boolean = true;
  public failureMessage: string = 'Relay error';

  async publish(event: NostrEvent): Promise<PublishResult[]> {
    this.publishedEvents.push(event);

    if (this.shouldSucceed) {
      return [
        { relay: 'wss://relay1.example.com/', success: true, message: 'OK' },
        { relay: 'wss://relay2.example.com/', success: true, message: 'OK' }
      ];
    } else {
      return [
        { relay: 'wss://relay1.example.com/', success: false, message: this.failureMessage }
      ];
    }
  }

  resetMock(): void {
    this.publishedEvents = [];
    this.shouldSucceed = true;
  }
}

// ============================================================================
// Arbiters for Property-Based Testing
// ============================================================================

const arbSessionId = () => fc.base64String({ minLength: 24, maxLength: 24 });
const arbIpv6 = () => fc.constantFrom('2001:db8::1', 'fe80::1', '2001:db8:85a3::8a2e:370:7334');
const arbPort = () => fc.option(fc.integer({ min: 1, max: 65535 }));
const arbReason = () => fc.constantFrom('timeout', 'user', 'superseded');

// ============================================================================
// Test Suites
// ============================================================================

describe('P2P Signal Handler - sendP2POffer', () => {
  let senderKeypair: NostrKeypair;
  let recipientKeypair: NostrKeypair;
  let database: Database;
  let mockRelayPool: MockRelayPool;

  beforeEach(async () => {
    senderKeypair = generateKeypair().keypair;
    recipientKeypair = generateKeypair().keypair;
    database = await createTestDatabase();
    mockRelayPool = new MockRelayPool();
  });

  afterEach(() => {
    database.close();
  });

  it('property: offer messages contain valid NIP-59 wrapper (kind 1059)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSessionId(),
        fc.string({ minLength: 50, maxLength: 500 }),
        arbIpv6(),
        arbPort(),
        async (sessionId, sdp, ipv6, port) => {
          mockRelayPool.resetMock();
          const result = await sendP2POffer(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            'v=0\no=- 123 IN IP6 ' + ipv6,
            ipv6,
            port || undefined,
            mockRelayPool as any,
            database
          );

          if (result.success && result.eventId) {
            expect(mockRelayPool.publishedEvents.length).toBeGreaterThan(0);
            const wrappedEvent = mockRelayPool.publishedEvents[0];
            expect(wrappedEvent.kind).toBe(1059);
            expect(wrappedEvent.id).toBe(result.eventId);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('property: offer idempotency - same offer twice returns skipped on second send', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSessionId(),
        fc.string({ minLength: 50, maxLength: 200 }),
        arbIpv6(),
        arbPort(),
        async (sessionId, sdp, ipv6, port) => {
          mockRelayPool.resetMock();

          // Send first offer
          const result1 = await sendP2POffer(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            'v=0\no=- 123 IN IP6 ' + ipv6,
            ipv6,
            port || undefined,
            mockRelayPool as any,
            database
          );

          expect(result1.success).toBe(true);
          expect(result1.skipped).not.toBe(true);

          mockRelayPool.resetMock();

          // Send same offer again
          const result2 = await sendP2POffer(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            'v=0\no=- 123 IN IP6 ' + ipv6,
            ipv6,
            port || undefined,
            mockRelayPool as any,
            database
          );

          expect(result2.success).toBe(true);
          expect(result2.skipped).toBe(true);
          expect(mockRelayPool.publishedEvents.length).toBe(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('property: offer messages contain correct structure when parsed', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSessionId(),
        arbIpv6(),
        arbPort(),
        async (sessionId, ipv6, port) => {
          mockRelayPool.resetMock();
          const sdpContent = 'v=0\no=- 123 IN IP6 ' + ipv6;

          const result = await sendP2POffer(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            sdpContent,
            ipv6,
            port || undefined,
            mockRelayPool as any,
            database
          );

          if (result.success && result.eventId) {
            expect(mockRelayPool.publishedEvents[0].kind).toBe(1059);
            const wrappedEvent = mockRelayPool.publishedEvents[0];
            expect(wrappedEvent.sig).toBeDefined();
            expect(wrappedEvent.sig.length).toBe(128);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it('property: offer includes tie_break field with sender pubkey', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSessionId(),
        arbIpv6(),
        async (sessionId, ipv6) => {
          mockRelayPool.resetMock();

          const result = await sendP2POffer(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            'v=0\no=- 123 IN IP6 ' + ipv6,
            ipv6,
            undefined,
            mockRelayPool as any,
            database
          );

          if (result.success && result.eventId) {
            const wrappedEvent = mockRelayPool.publishedEvents[0];
            expect(wrappedEvent).toBeDefined();
            expect(wrappedEvent.sig).toBeDefined();
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('P2P Signal Handler - sendP2PAnswer', () => {
  let senderKeypair: NostrKeypair;
  let recipientKeypair: NostrKeypair;
  let database: Database;
  let mockRelayPool: MockRelayPool;

  beforeEach(async () => {
    senderKeypair = generateKeypair().keypair;
    recipientKeypair = generateKeypair().keypair;
    database = await createTestDatabase();
    mockRelayPool = new MockRelayPool();
  });

  afterEach(() => {
    database.close();
  });

  it('property: answer messages wrapped in kind 1059 (NIP-59)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSessionId(),
        fc.string({ minLength: 50, maxLength: 500 }),
        arbIpv6(),
        arbPort(),
        async (sessionId, sdp, ipv6, port) => {
          mockRelayPool.resetMock();

          const result = await sendP2PAnswer(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            'v=0\no=- 123 IN IP6 ' + ipv6,
            ipv6,
            port || undefined,
            mockRelayPool as any,
            database
          );

          if (result.success && result.eventId) {
            const wrappedEvent = mockRelayPool.publishedEvents[0];
            expect(wrappedEvent.kind).toBe(1059);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it('property: answer idempotency - identical answers not sent twice', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSessionId(),
        fc.string({ minLength: 50, maxLength: 200 }),
        arbIpv6(),
        async (sessionId, sdp, ipv6) => {
          mockRelayPool.resetMock();

          const result1 = await sendP2PAnswer(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            'v=0\no=- 123 IN IP6 ' + ipv6,
            ipv6,
            undefined,
            mockRelayPool as any,
            database
          );

          expect(result1.success).toBe(true);
          expect(result1.skipped).not.toBe(true);

          mockRelayPool.resetMock();

          const result2 = await sendP2PAnswer(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            'v=0\no=- 123 IN IP6 ' + ipv6,
            ipv6,
            undefined,
            mockRelayPool as any,
            database
          );

          expect(result2.success).toBe(true);
          expect(result2.skipped).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('P2P Signal Handler - sendP2PIceCandidate', () => {
  let senderKeypair: NostrKeypair;
  let recipientKeypair: NostrKeypair;
  let database: Database;
  let mockRelayPool: MockRelayPool;

  beforeEach(async () => {
    senderKeypair = generateKeypair().keypair;
    recipientKeypair = generateKeypair().keypair;
    database = await createTestDatabase();
    mockRelayPool = new MockRelayPool();
  });

  afterEach(() => {
    database.close();
  });

  it('property: ICE candidates wrapped in kind 1059', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSessionId(),
        async (sessionId) => {
          mockRelayPool.resetMock();

          const result = await sendP2PIceCandidate(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            'candidate:1 1 UDP 2122260223 192.0.2.1 54321 typ host',
            mockRelayPool as any,
            database
          );

          if (result.success && result.eventId) {
            const wrappedEvent = mockRelayPool.publishedEvents[0];
            expect(wrappedEvent.kind).toBe(1059);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('property: multiple different ICE candidates each sent separately', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSessionId(),
        async (sessionId) => {
          mockRelayPool.resetMock();

          const candidate1 = 'candidate:1 1 UDP 2122260223 192.0.2.1 54321 typ host';
          const result1 = await sendP2PIceCandidate(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            candidate1,
            mockRelayPool as any,
            database
          );

          expect(result1.success).toBe(true);

          const candidate2 = 'candidate:2 1 UDP 2122260223 192.0.2.2 54322 typ host';
          const result2 = await sendP2PIceCandidate(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            candidate2,
            mockRelayPool as any,
            database
          );

          expect(result2.success).toBe(true);
          expect(mockRelayPool.publishedEvents.length).toBe(2);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('property: identical ICE candidate idempotent - not sent twice', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSessionId(),
        async (sessionId) => {
          mockRelayPool.resetMock();

          const candidate = 'candidate:1 1 UDP 2122260223 192.0.2.1 54321 typ host';

          const result1 = await sendP2PIceCandidate(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            candidate,
            mockRelayPool as any,
            database
          );

          expect(result1.skipped).not.toBe(true);
          mockRelayPool.resetMock();

          const result2 = await sendP2PIceCandidate(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            candidate,
            mockRelayPool as any,
            database
          );

          expect(result2.skipped).toBe(true);
          expect(mockRelayPool.publishedEvents.length).toBe(0);
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('P2P Signal Handler - sendP2PClose', () => {
  let senderKeypair: NostrKeypair;
  let recipientKeypair: NostrKeypair;
  let database: Database;
  let mockRelayPool: MockRelayPool;

  beforeEach(async () => {
    senderKeypair = generateKeypair().keypair;
    recipientKeypair = generateKeypair().keypair;
    database = await createTestDatabase();
    mockRelayPool = new MockRelayPool();
  });

  afterEach(() => {
    database.close();
  });

  it('property: close messages wrapped in kind 1059 for all valid reasons', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSessionId(),
        arbReason(),
        async (sessionId, reason) => {
          mockRelayPool.resetMock();

          const result = await sendP2PClose(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            reason as any,
            mockRelayPool as any,
            database
          );

          if (result.success && result.eventId) {
            const wrappedEvent = mockRelayPool.publishedEvents[0];
            expect(wrappedEvent.kind).toBe(1059);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('property: close messages NOT idempotent - always sent', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSessionId(),
        arbReason(),
        async (sessionId, reason) => {
          mockRelayPool.resetMock();

          const result1 = await sendP2PClose(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            reason as any,
            mockRelayPool as any,
            database
          );

          expect(result1.success).toBe(true);
          expect(result1.skipped).not.toBe(true);

          mockRelayPool.resetMock();

          const result2 = await sendP2PClose(
            senderKeypair,
            recipientKeypair.pubkeyHex,
            sessionId,
            reason as any,
            mockRelayPool as any,
            database
          );

          expect(result2.success).toBe(true);
          expect(result2.skipped).not.toBe(true);
          expect(mockRelayPool.publishedEvents.length).toBe(1);
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('P2P Signal Handler - parseP2PSignal', () => {
  let senderKeypair: NostrKeypair;
  let database: Database;

  beforeEach(async () => {
    senderKeypair = generateKeypair().keypair;
    database = await createTestDatabase();
  });

  it('property: valid offer message is parsed and returns P2POfferMessage', async () => {
    await fc.assert(
      fc.property(
        arbSessionId(),
        arbIpv6(),
        fc.option(arbPort()),
        (sessionId, ipv6, port) => {
          const message = {
            type: 'p2p_offer',
            v: P2P_PROTOCOL_VERSION,
            ts: Math.floor(Date.now() / 1000),
            nonce: randomBytes(16).toString('hex'),
            session_id: sessionId,
            from_ipv6: ipv6,
            from_port: port,
            sdp: 'v=0\no=- 123 IN IP6 ' + ipv6,
            tie_break: senderKeypair.pubkeyHex
          };

          const innerEvent: NostrEvent = {
            kind: 443,
            pubkey: senderKeypair.pubkeyHex,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: JSON.stringify(message),
            id: 'test-id',
            sig: 'test-sig'
          };

          const result = parseP2PSignal(innerEvent, senderKeypair.pubkeyHex, database);

          expect(result).not.toBeNull();
          expect(result?.type).toBe('p2p_offer');
          if (result?.type === 'p2p_offer') {
            expect(result.session_id).toBe(sessionId);
            expect(result.from_ipv6).toBe(ipv6);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('property: answer message is parsed and returns P2PAnswerMessage', async () => {
    await fc.assert(
      fc.property(
        arbSessionId(),
        arbIpv6(),
        (sessionId, ipv6) => {
          const message = {
            type: 'p2p_answer',
            v: P2P_PROTOCOL_VERSION,
            ts: Math.floor(Date.now() / 1000),
            nonce: randomBytes(16).toString('hex'),
            session_id: sessionId,
            from_ipv6: ipv6,
            sdp: 'v=0\no=- 123 IN IP6 ' + ipv6
          };

          const innerEvent: NostrEvent = {
            kind: 443,
            pubkey: senderKeypair.pubkeyHex,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: JSON.stringify(message),
            id: 'test-id',
            sig: 'test-sig'
          };

          const result = parseP2PSignal(innerEvent, senderKeypair.pubkeyHex, database);

          expect(result).not.toBeNull();
          expect(result?.type).toBe('p2p_answer');
        }
      ),
      { numRuns: 30 }
    );
  });

  it('property: ICE message is parsed correctly', async () => {
    await fc.assert(
      fc.property(
        arbSessionId(),
        (sessionId) => {
          const candidate = 'candidate:1 1 UDP 2122260223 192.0.2.1 54321 typ host';
          const message = {
            type: 'p2p_ice',
            v: P2P_PROTOCOL_VERSION,
            ts: Math.floor(Date.now() / 1000),
            nonce: randomBytes(16).toString('hex'),
            session_id: sessionId,
            candidate: candidate
          };

          const innerEvent: NostrEvent = {
            kind: 443,
            pubkey: senderKeypair.pubkeyHex,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: JSON.stringify(message),
            id: 'test-id',
            sig: 'test-sig'
          };

          const result = parseP2PSignal(innerEvent, senderKeypair.pubkeyHex, database);

          expect(result).not.toBeNull();
          expect(result?.type).toBe('p2p_ice');
        }
      ),
      { numRuns: 30 }
    );
  });

  it('property: close message is parsed and validates reason field', async () => {
    await fc.assert(
      fc.property(
        arbSessionId(),
        arbReason(),
        (sessionId, reason) => {
          const message = {
            type: 'p2p_close',
            v: P2P_PROTOCOL_VERSION,
            ts: Math.floor(Date.now() / 1000),
            nonce: randomBytes(16).toString('hex'),
            session_id: sessionId,
            reason: reason
          };

          const innerEvent: NostrEvent = {
            kind: 443,
            pubkey: senderKeypair.pubkeyHex,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: JSON.stringify(message),
            id: 'test-id',
            sig: 'test-sig'
          };

          const result = parseP2PSignal(innerEvent, senderKeypair.pubkeyHex, database);

          expect(result).not.toBeNull();
          expect(result?.type).toBe('p2p_close');
        }
      ),
      { numRuns: 30 }
    );
  });

  it('property: timestamp validation - messages within ±10 minutes accepted', async () => {
    await fc.assert(
      fc.property(
        fc.integer({ min: -600, max: 600 }),
        (deltaSeconds) => {
          const nowSeconds = Math.floor(Date.now() / 1000);
          const ts = nowSeconds + deltaSeconds;

          const message = {
            type: 'p2p_offer',
            v: P2P_PROTOCOL_VERSION,
            ts: ts,
            nonce: randomBytes(16).toString('hex'),
            session_id: 'test-session-id',
            from_ipv6: '2001:db8::1',
            sdp: 'v=0\r\no=- 123 456 IN IP6 2001:db8::1\r\n',
            tie_break: senderKeypair.pubkeyHex
          };

          const innerEvent: NostrEvent = {
            kind: 443,
            pubkey: senderKeypair.pubkeyHex,
            created_at: nowSeconds,
            tags: [],
            content: JSON.stringify(message),
            id: 'test-id',
            sig: 'test-sig'
          };

          const result = parseP2PSignal(innerEvent, senderKeypair.pubkeyHex, database);

          expect(result).not.toBeNull();
          expect(result?.ts).toBe(ts);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('property: timestamp validation - messages outside ±10 minutes rejected', async () => {
    await fc.assert(
      fc.property(
        fc.integer({ min: 601, max: 3600 }).chain(
          (positive) =>
            fc.tuple(
              fc.constantFrom(positive, -positive)
            )
        ),
        ([deltaSeconds]) => {
          const nowSeconds = Math.floor(Date.now() / 1000);
          const ts = nowSeconds + deltaSeconds;

          const message = {
            type: 'p2p_offer',
            v: P2P_PROTOCOL_VERSION,
            ts: ts,
            nonce: randomBytes(16).toString('hex'),
            session_id: 'test-session-id',
            from_ipv6: '2001:db8::1',
            sdp: 'v=0\r\no=- 123 456 IN IP6 2001:db8::1\r\n',
            tie_break: senderKeypair.pubkeyHex
          };

          const innerEvent: NostrEvent = {
            kind: 443,
            pubkey: senderKeypair.pubkeyHex,
            created_at: nowSeconds,
            tags: [],
            content: JSON.stringify(message),
            id: 'test-id',
            sig: 'test-sig'
          };

          const result = parseP2PSignal(innerEvent, senderKeypair.pubkeyHex, database);

          expect(result).toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('property: wrong sender pubkey is rejected', async () => {
    const wrongKeypair = generateKeypair().keypair;

    const message = {
      type: 'p2p_offer',
      v: P2P_PROTOCOL_VERSION,
      ts: Math.floor(Date.now() / 1000),
      nonce: randomBytes(16).toString('hex'),
      session_id: 'test-session-id',
      from_ipv6: '2001:db8::1',
      sdp: 'v=0\r\no=- 123 456 IN IP6 2001:db8::1\r\n',
      tie_break: senderKeypair.pubkeyHex
    };

    const innerEvent: NostrEvent = {
      kind: 443,
      pubkey: wrongKeypair.pubkeyHex,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(message),
      id: 'test-id',
      sig: 'test-sig'
    };

    const result = parseP2PSignal(innerEvent, senderKeypair.pubkeyHex, database);

    expect(result).toBeNull();
  });

  it('property: wrong event kind rejected', async () => {
    const message = {
      type: 'p2p_offer',
      v: P2P_PROTOCOL_VERSION,
      ts: Math.floor(Date.now() / 1000),
      nonce: randomBytes(16).toString('hex'),
      session_id: 'test-session-id',
      from_ipv6: '2001:db8::1',
      sdp: 'v=0\r\no=- 123 456 IN IP6 2001:db8::1\r\n',
      tie_break: senderKeypair.pubkeyHex
    };

    const innerEvent: NostrEvent = {
      kind: 4,
      pubkey: senderKeypair.pubkeyHex,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(message),
      id: 'test-id',
      sig: 'test-sig'
    };

    const result = parseP2PSignal(innerEvent, senderKeypair.pubkeyHex, database);

    expect(result).toBeNull();
  });

  it('property: invalid JSON content is rejected', async () => {
    const innerEvent: NostrEvent = {
      kind: 443,
      pubkey: senderKeypair.pubkeyHex,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: 'not valid json {',
      id: 'test-id',
      sig: 'test-sig'
    };

    const result = parseP2PSignal(innerEvent, senderKeypair.pubkeyHex, database);

    expect(result).toBeNull();
  });

  it('property: missing required fields are rejected', async () => {
    const incompleteMessage = {
      type: 'p2p_offer',
      v: P2P_PROTOCOL_VERSION
    };

    const innerEvent: NostrEvent = {
      kind: 443,
      pubkey: senderKeypair.pubkeyHex,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(incompleteMessage),
      id: 'test-id',
      sig: 'test-sig'
    };

    const result = parseP2PSignal(innerEvent, senderKeypair.pubkeyHex, database);

    expect(result).toBeNull();
  });

  it('property: version mismatch is rejected', async () => {
    const message = {
      type: 'p2p_offer',
      v: 999,
      ts: Math.floor(Date.now() / 1000),
      nonce: randomBytes(16).toString('hex'),
      session_id: 'test-session-id',
      from_ipv6: '2001:db8::1',
      sdp: 'v=0\r\no=- 123 456 IN IP6 2001:db8::1\r\n',
      tie_break: senderKeypair.pubkeyHex
    };

    const innerEvent: NostrEvent = {
      kind: 443,
      pubkey: senderKeypair.pubkeyHex,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(message),
      id: 'test-id',
      sig: 'test-sig'
    };

    const result = parseP2PSignal(innerEvent, senderKeypair.pubkeyHex, database);

    expect(result).toBeNull();
  });

  it('property: invalid close reason is rejected', async () => {
    const message = {
      type: 'p2p_close',
      v: P2P_PROTOCOL_VERSION,
      ts: Math.floor(Date.now() / 1000),
      nonce: randomBytes(16).toString('hex'),
      session_id: 'test-session-id',
      reason: 'invalid_reason'
    };

    const innerEvent: NostrEvent = {
      kind: 443,
      pubkey: senderKeypair.pubkeyHex,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(message),
      id: 'test-id',
      sig: 'test-sig'
    };

    const result = parseP2PSignal(innerEvent, senderKeypair.pubkeyHex, database);

    expect(result).toBeNull();
  });
});

describe('P2P Signal Handler - Relay Failure Handling', () => {
  let senderKeypair: NostrKeypair;
  let recipientKeypair: NostrKeypair;
  let database: Database;
  let mockRelayPool: MockRelayPool;

  beforeEach(async () => {
    senderKeypair = generateKeypair().keypair;
    recipientKeypair = generateKeypair().keypair;
    database = await createTestDatabase();
    mockRelayPool = new MockRelayPool();
  });

  afterEach(() => {
    database.close();
  });

  it('property: relay failure returns success false with error message', async () => {
    mockRelayPool.shouldSucceed = false;
    mockRelayPool.failureMessage = 'Connection timeout';

    const result = await sendP2POffer(
      senderKeypair,
      recipientKeypair.pubkeyHex,
      'session-id-123',
      'v=0\no=- 123 IN IP6 2001:db8::1',
      '2001:db8::1',
      undefined,
      mockRelayPool as any,
      database
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('timeout');
  });
});
