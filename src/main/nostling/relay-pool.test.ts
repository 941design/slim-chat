import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import { RelayPool, type RelayEndpoint, type Filter, type RelayStatus } from './relay-pool';
import { SimplePool } from 'nostr-tools';
import type { NostrEvent } from './crypto';

jest.mock('../logging', () => ({
  log: jest.fn(),
}));

jest.mock('nostr-tools', () => ({
  SimplePool: jest.fn()
}));

const MockedSimplePool = SimplePool as jest.MockedClass<typeof SimplePool>;

describe('RelayPool', () => {
  let pool: RelayPool;
  let mockPool: jest.Mocked<SimplePool>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockPool = {
      ensureRelay: jest.fn(),
      close: jest.fn(),
      publish: jest.fn(),
      subscribeMany: jest.fn(),
      listConnectionStatus: jest.fn(() => new Map())
    } as any;

    MockedSimplePool.mockImplementation(() => mockPool);
    pool = new RelayPool();
  });

  afterEach(() => {
    pool.disconnect();
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Constructor', () => {
    it('initializes with empty state', () => {
      const newPool = new RelayPool();
      const status = newPool.getStatus();
      expect(status.size).toBe(0);
      newPool.disconnect(); // Clean up to prevent leaked timers
    });
  });

  describe('connect', () => {
    it('connects to single relay', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay.example.com' }
      ];

      await pool.connect(endpoints);

      expect(mockPool.ensureRelay).toHaveBeenCalledWith(
        'wss://relay.example.com',
        { connectionTimeout: 5000 }
      );
    });

    it('connects to multiple relays concurrently', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay1.example.com' },
        { url: 'wss://relay2.example.com' },
        { url: 'wss://relay3.example.com' }
      ];

      await pool.connect(endpoints);

      expect(mockPool.ensureRelay).toHaveBeenCalledTimes(3);
      expect(mockPool.ensureRelay).toHaveBeenCalledWith(
        'wss://relay1.example.com',
        { connectionTimeout: 5000 }
      );
      expect(mockPool.ensureRelay).toHaveBeenCalledWith(
        'wss://relay2.example.com',
        { connectionTimeout: 5000 }
      );
      expect(mockPool.ensureRelay).toHaveBeenCalledWith(
        'wss://relay3.example.com',
        { connectionTimeout: 5000 }
      );
    });

    it('handles connection failures gracefully', async () => {
      mockPool.ensureRelay.mockRejectedValue(new Error('Connection failed'));

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay.example.com' }
      ];

      await pool.connect(endpoints);

      const status = pool.getStatus();
      expect(status.get('wss://relay.example.com')).toBe('error');
    });

    it('is idempotent - calling connect multiple times is safe', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay.example.com' }
      ];

      await pool.connect(endpoints);
      await pool.connect(endpoints);

      expect(mockPool.close).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('closes all connections', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay1.example.com' },
        { url: 'wss://relay2.example.com' }
      ];

      await pool.connect(endpoints);
      pool.disconnect();

      expect(mockPool.close).toHaveBeenCalledWith([
        'wss://relay1.example.com',
        'wss://relay2.example.com'
      ]);
    });

    it('is idempotent - calling disconnect when disconnected is safe', () => {
      pool.disconnect();
      pool.disconnect();

      expect(true).toBe(true);
    });

    it('clears status map', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay.example.com' }
      ];

      await pool.connect(endpoints);
      pool.disconnect();

      const status = pool.getStatus();
      expect(status.size).toBe(0);
    });
  });

  describe('publish', () => {
    const createMockEvent = (): NostrEvent => ({
      id: 'event-id-123',
      pubkey: 'pubkey-hex',
      created_at: Math.floor(Date.now() / 1000),
      kind: 4,
      tags: [['p', 'recipient-pubkey']],
      content: 'encrypted-content',
      sig: 'signature-hex'
    });

    it('publishes to all connected relays', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);
      mockPool.publish.mockReturnValue([Promise.resolve('OK'), Promise.resolve('OK')]);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay1.example.com' },
        { url: 'wss://relay2.example.com' }
      ];

      await pool.connect(endpoints);

      const event = createMockEvent();
      const results = await pool.publish(event);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('returns empty array when no relays connected', async () => {
      const event = createMockEvent();
      const results = await pool.publish(event);

      expect(results).toEqual([]);
    });

    it('handles publish timeout', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);
      mockPool.publish.mockReturnValue([
        new Promise((resolve) => setTimeout(resolve, 10000))
      ]);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay.example.com' }
      ];

      await pool.connect(endpoints);

      const event = createMockEvent();
      const publishPromise = pool.publish(event);

      // Advance timers to trigger the 5-second timeout
      await jest.advanceTimersByTimeAsync(5100);

      const results = await publishPromise;

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].message).toContain('Timeout');
    });

    it('handles partial publish failures', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);
      mockPool.publish.mockReturnValue([
        Promise.resolve('OK'),
        Promise.reject(new Error('Failed'))
      ]);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay1.example.com' },
        { url: 'wss://relay2.example.com' }
      ];

      await pool.connect(endpoints);

      const event = createMockEvent();
      const results = await pool.publish(event);

      expect(results).toHaveLength(2);
      const successResults = results.filter(r => r.success);
      const failureResults = results.filter(r => !r.success);

      expect(successResults.length).toBe(1);
      expect(failureResults.length).toBe(1);
    });
  });

  describe('subscribe', () => {
    it('subscribes to all connected relays', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);
      const mockSub = { close: jest.fn() };
      mockPool.subscribeMany.mockReturnValue(mockSub as any);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay1.example.com' },
        { url: 'wss://relay2.example.com' }
      ];

      await pool.connect(endpoints);

      const filters: Filter[] = [{ kinds: [4] }];
      const onEvent = jest.fn();

      const subscription = pool.subscribe(filters, onEvent);

      expect(mockPool.subscribeMany).toHaveBeenCalledWith(
        ['wss://relay1.example.com', 'wss://relay2.example.com'],
        { kinds: [4] },
        expect.objectContaining({
          onevent: expect.any(Function)
        })
      );

      subscription.close();
      expect(mockSub.close).toHaveBeenCalled();
    });

    it('deduplicates events by event.id', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);

      let capturedEventHandler: ((event: any) => void) | undefined;
      mockPool.subscribeMany.mockImplementation((relays, filter, params) => {
        capturedEventHandler = params.onevent;
        return { close: jest.fn() } as any;
      });

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay.example.com' }
      ];

      await pool.connect(endpoints);

      const filters: Filter[] = [{ kinds: [4] }];
      const onEvent = jest.fn();

      pool.subscribe(filters, onEvent);

      const event = {
        id: 'duplicate-id',
        pubkey: 'pubkey',
        created_at: 123456,
        kind: 4,
        tags: [],
        content: 'test',
        sig: 'sig'
      };

      capturedEventHandler!(event);
      capturedEventHandler!(event);
      capturedEventHandler!(event);

      expect(onEvent).toHaveBeenCalledTimes(1);
    });

    it('returns no-op subscription when no relays connected', () => {
      const filters: Filter[] = [{ kinds: [4] }];
      const onEvent = jest.fn();

      const subscription = pool.subscribe(filters, onEvent);

      expect(subscription).toBeDefined();
      expect(() => subscription.close()).not.toThrow();
    });
  });

  describe('getStatus', () => {
    it('returns current status snapshot', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay.example.com' }
      ];

      await pool.connect(endpoints);

      const status = pool.getStatus();
      expect(status).toBeInstanceOf(Map);
      expect(status.has('wss://relay.example.com')).toBe(true);
    });

    it('returns a copy, not reference to internal state', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay.example.com' }
      ];

      await pool.connect(endpoints);

      const status1 = pool.getStatus();
      const status2 = pool.getStatus();

      expect(status1).not.toBe(status2);
      expect(status1.size).toBe(status2.size);
    });
  });

  describe('onStatusChange', () => {
    it('registers callback for status changes', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);

      const callback = jest.fn();
      pool.onStatusChange(callback);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay.example.com' }
      ];

      await pool.connect(endpoints);

      expect(callback).toHaveBeenCalled();
      const calls = (callback as jest.Mock).mock.calls;
      expect(calls.some(([url]) => url === 'wss://relay.example.com')).toBe(true);
    });

    it('supports multiple callbacks', async () => {
      mockPool.ensureRelay.mockResolvedValue({} as any);

      const callback1 = jest.fn();
      const callback2 = jest.fn();

      pool.onStatusChange(callback1);
      pool.onStatusChange(callback2);

      const endpoints: RelayEndpoint[] = [
        { url: 'wss://relay.example.com' }
      ];

      await pool.connect(endpoints);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('Property-Based Tests', () => {
    it('connect maintains invariant: each relay has at most one status', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl({ validSchemes: ['wss', 'ws'] })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (endpoints) => {
            mockPool.ensureRelay.mockResolvedValue({} as any);

            const uniqueUrls = new Set(endpoints.map(e => e.url));
            const uniqueEndpoints = Array.from(uniqueUrls).map(url => ({ url }));

            await pool.connect(uniqueEndpoints);

            const status = pool.getStatus();
            expect(status.size).toBe(uniqueEndpoints.length);

            for (const endpoint of uniqueEndpoints) {
              expect(status.has(endpoint.url)).toBe(true);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('publish sends to all connected relays', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl({ validSchemes: ['wss'] })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (endpoints) => {
            mockPool.ensureRelay.mockResolvedValue({} as any);
            mockPool.publish.mockReturnValue(
              endpoints.map(() => Promise.resolve('OK'))
            );

            await pool.connect(endpoints);

            const event: NostrEvent = {
              id: 'test-id',
              pubkey: 'test-pubkey',
              created_at: Math.floor(Date.now() / 1000),
              kind: 4,
              tags: [],
              content: 'test',
              sig: 'test-sig'
            };

            const results = await pool.publish(event);

            expect(results.length).toBe(endpoints.length);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('disconnect is idempotent', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (disconnectCount) => {
            mockPool.ensureRelay.mockResolvedValue({} as any);

            const endpoints: RelayEndpoint[] = [
              { url: 'wss://relay.example.com' }
            ];

            await pool.connect(endpoints);

            for (let i = 0; i < disconnectCount; i++) {
              pool.disconnect();
            }

            const status = pool.getStatus();
            expect(status.size).toBe(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('event deduplication works for any number of duplicates', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.integer({ min: 1, max: 100 }),
          async (eventId, duplicateCount) => {
            mockPool.ensureRelay.mockResolvedValue({} as any);

            let capturedEventHandler: ((event: any) => void) | undefined;
            mockPool.subscribeMany.mockImplementation((relays, filter, params) => {
              capturedEventHandler = params.onevent;
              return { close: jest.fn() } as any;
            });

            const endpoints: RelayEndpoint[] = [
              { url: 'wss://relay.example.com' }
            ];

            await pool.connect(endpoints);

            const onEvent = jest.fn();
            pool.subscribe([{ kinds: [4] }], onEvent);

            const event = {
              id: eventId,
              pubkey: 'pubkey',
              created_at: 123456,
              kind: 4,
              tags: [],
              content: 'test',
              sig: 'sig'
            };

            for (let i = 0; i < duplicateCount; i++) {
              capturedEventHandler!(event);
            }

            expect(onEvent).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('status callbacks are invoked for every status change', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (callbackCount) => {
            mockPool.ensureRelay.mockResolvedValue({} as any);

            const callbacks = Array.from({ length: callbackCount }, () => jest.fn());

            callbacks.forEach(cb => pool.onStatusChange(cb));

            const endpoints: RelayEndpoint[] = [
              { url: 'wss://relay.example.com' }
            ];

            await pool.connect(endpoints);

            callbacks.forEach(cb => {
              expect(cb).toHaveBeenCalled();
            });
          }
        ),
        { numRuns: 10 }
      );
    });

    it('subscribe respects read flag: read-only relays receive subscriptions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl({ validSchemes: ['wss'] }),
              read: fc.constant(true)
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (readableRelays) => {
            mockPool.ensureRelay.mockClear();
            mockPool.subscribeMany.mockClear();
            mockPool.publish.mockClear();
            mockPool.ensureRelay.mockResolvedValue({} as any);
            const mockSub = { close: jest.fn() };
            mockPool.subscribeMany.mockReturnValue(mockSub as any);

            pool = new RelayPool();
            await pool.connect(readableRelays);

            const onEvent = jest.fn();
            pool.subscribe([{ kinds: [1] }], onEvent);

            expect(mockPool.subscribeMany).toHaveBeenCalled();
            const subscribeCall = mockPool.subscribeMany.mock.calls[0];
            const relaysPassedToSubscribe = subscribeCall[0] as string[];

            for (const relay of readableRelays) {
              expect(relaysPassedToSubscribe).toContain(relay.url);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('subscribe never contacts write-only relays', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl({ validSchemes: ['wss'] }),
              read: fc.constant(false),
              write: fc.constant(true)
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (writeOnlyRelays) => {
            mockPool.ensureRelay.mockResolvedValue({} as any);
            const mockSub = { close: jest.fn() };
            mockPool.subscribeMany.mockReturnValue(mockSub as any);

            await pool.connect(writeOnlyRelays);

            const onEvent = jest.fn();
            const subscription = pool.subscribe([{ kinds: [1] }], onEvent);

            expect(mockPool.subscribeMany).not.toHaveBeenCalled();
            expect(() => subscription.close()).not.toThrow();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('publish respects write flag: write-only relays receive publishes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl({ validSchemes: ['wss'] }),
              write: fc.constant(true)
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (writableRelays) => {
            mockPool.ensureRelay.mockClear();
            mockPool.subscribeMany.mockClear();
            mockPool.publish.mockClear();
            mockPool.ensureRelay.mockResolvedValue({} as any);
            mockPool.publish.mockReturnValue(
              writableRelays.map(() => Promise.resolve('OK'))
            );

            pool = new RelayPool();
            await pool.connect(writableRelays);

            const event: NostrEvent = {
              id: 'test-id',
              pubkey: 'test-pubkey',
              created_at: Math.floor(Date.now() / 1000),
              kind: 4,
              tags: [],
              content: 'test',
              sig: 'test-sig'
            };

            const results = await pool.publish(event);

            expect(mockPool.publish).toHaveBeenCalled();
            const publishCall = mockPool.publish.mock.calls[0];
            const relaysPassedToPublish = publishCall[0] as string[];

            for (const relay of writableRelays) {
              expect(relaysPassedToPublish).toContain(relay.url);
            }
            expect(results).toHaveLength(writableRelays.length);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('publish never contacts read-only relays', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl({ validSchemes: ['wss'] }),
              read: fc.constant(true),
              write: fc.constant(false)
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (readOnlyRelays) => {
            mockPool.ensureRelay.mockResolvedValue({} as any);
            mockPool.publish.mockReturnValue([]);

            await pool.connect(readOnlyRelays);

            const event: NostrEvent = {
              id: 'test-id',
              pubkey: 'test-pubkey',
              created_at: Math.floor(Date.now() / 1000),
              kind: 4,
              tags: [],
              content: 'test',
              sig: 'test-sig'
            };

            const results = await pool.publish(event);

            expect(mockPool.publish).not.toHaveBeenCalled();
            expect(results).toEqual([]);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('mixed configuration: relays with both flags work for both operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl({ validSchemes: ['wss'] }),
              read: fc.constant(true),
              write: fc.constant(true)
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (mixedRelays) => {
            mockPool.ensureRelay.mockClear();
            mockPool.subscribeMany.mockClear();
            mockPool.publish.mockClear();
            mockPool.ensureRelay.mockResolvedValue({} as any);
            const mockSub = { close: jest.fn() };
            mockPool.subscribeMany.mockReturnValue(mockSub as any);
            mockPool.publish.mockReturnValue(
              mixedRelays.map(() => Promise.resolve('OK'))
            );

            pool = new RelayPool();
            await pool.connect(mixedRelays);

            const onEvent = jest.fn();
            pool.subscribe([{ kinds: [1] }], onEvent);

            expect(mockPool.subscribeMany).toHaveBeenCalled();
            const subscribeCall = mockPool.subscribeMany.mock.calls[0];
            const relaysForSubscribe = subscribeCall[0] as string[];
            expect(relaysForSubscribe).toHaveLength(mixedRelays.length);

            const event: NostrEvent = {
              id: 'test-id',
              pubkey: 'test-pubkey',
              created_at: Math.floor(Date.now() / 1000),
              kind: 4,
              tags: [],
              content: 'test',
              sig: 'test-sig'
            };

            const results = await pool.publish(event);

            expect(mockPool.publish).toHaveBeenCalled();
            const publishCall = mockPool.publish.mock.calls[0];
            const relaysForPublish = publishCall[0] as string[];
            expect(relaysForPublish).toHaveLength(mixedRelays.length);
            expect(results).toHaveLength(mixedRelays.length);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('backward compatibility: endpoints without flags default to read=true, write=true', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl({ validSchemes: ['wss'] })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (legacyEndpoints) => {
            mockPool.ensureRelay.mockClear();
            mockPool.subscribeMany.mockClear();
            mockPool.publish.mockClear();
            mockPool.ensureRelay.mockResolvedValue({} as any);
            const mockSub = { close: jest.fn() };
            mockPool.subscribeMany.mockReturnValue(mockSub as any);
            mockPool.publish.mockReturnValue(
              legacyEndpoints.map(() => Promise.resolve('OK'))
            );

            pool = new RelayPool();
            await pool.connect(legacyEndpoints);

            const onEvent = jest.fn();
            pool.subscribe([{ kinds: [1] }], onEvent);

            expect(mockPool.subscribeMany).toHaveBeenCalled();
            const subscribeCall = mockPool.subscribeMany.mock.calls[0];
            const relaysForSubscribe = subscribeCall[0] as string[];
            expect(relaysForSubscribe).toHaveLength(legacyEndpoints.length);

            const event: NostrEvent = {
              id: 'test-id',
              pubkey: 'test-pubkey',
              created_at: Math.floor(Date.now() / 1000),
              kind: 4,
              tags: [],
              content: 'test',
              sig: 'test-sig'
            };

            const results = await pool.publish(event);

            expect(mockPool.publish).toHaveBeenCalled();
            const publishCall = mockPool.publish.mock.calls[0];
            const relaysForPublish = publishCall[0] as string[];
            expect(relaysForPublish).toHaveLength(legacyEndpoints.length);
            expect(results).toHaveLength(legacyEndpoints.length);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('status tracking works for all relays regardless of read/write flags', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl({ validSchemes: ['wss'] }),
              read: fc.boolean(),
              write: fc.boolean()
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (mixedEndpoints) => {
            mockPool.ensureRelay.mockResolvedValue({} as any);

            const uniqueUrls = new Set(mixedEndpoints.map(e => e.url));
            const uniqueEndpoints = Array.from(uniqueUrls).map(url =>
              mixedEndpoints.find(e => e.url === url)!
            );

            await pool.connect(uniqueEndpoints);

            const status = pool.getStatus();
            expect(status.size).toBe(uniqueEndpoints.length);

            for (const endpoint of uniqueEndpoints) {
              expect(status.has(endpoint.url)).toBe(true);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
