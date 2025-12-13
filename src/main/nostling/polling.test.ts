import { describe, expect, it, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { NostlingService } from './service';
import { NostlingSecretStore } from './secret-store';
import { runMigrations } from '../database/migrations';
import { log } from '../logging';
import type { NostrEvent } from './crypto';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp'),
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn().mockReturnValue(false),
    encryptString: jest.fn(),
    decryptString: jest.fn(),
  },
}));

jest.mock('../logging', () => ({
  log: jest.fn(),
  setLogLevel: jest.fn(),
  getRecentLogs: jest.fn(),
}));

// Helper to create a typed mock relay pool
function createMockRelayPool(queryResult: NostrEvent[] | Error = []) {
  const querySyncMock = queryResult instanceof Error
    ? jest.fn<() => Promise<NostrEvent[]>>().mockRejectedValue(queryResult)
    : jest.fn<() => Promise<NostrEvent[]>>().mockResolvedValue(queryResult);

  return {
    querySync: querySyncMock,
    connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    subscribe: jest.fn().mockReturnValue({ close: jest.fn() }),
    getStatus: jest.fn().mockReturnValue(new Map()),
    onStatusChange: jest.fn(),
  };
}

class MemorySecretStore implements NostlingSecretStore {
  public readonly kind = 'local' as const;
  private readonly secrets = new Map<string, string>();

  async getSecret(ref: string): Promise<string | null> {
    return this.secrets.get(ref) || null;
  }

  async saveSecret(secret: string, ref?: string): Promise<string> {
    const key = ref || `ref:${this.secrets.size + 1}`;
    this.secrets.set(key, secret);
    return key;
  }

  async deleteSecret(ref: string): Promise<void> {
    this.secrets.delete(ref);
  }

  async listSecretRefs(): Promise<string[]> {
    return Array.from(this.secrets.keys());
  }
}

let SQL: SqlJsStatic;
let database: Database;
let service: NostlingService;
let secretStore: MemorySecretStore;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(async () => {
  jest.useFakeTimers();
  database = new SQL.Database();
  await runMigrations(database);
  secretStore = new MemorySecretStore();
  service = new NostlingService(database, secretStore, '/tmp/nostling-test');
  (log as jest.Mock).mockClear();
});

afterEach(() => {
  service.stopPolling();
  jest.clearAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('Message Polling', () => {
  describe('pollMessages()', () => {
    it('returns 0 when relay pool is not initialized', async () => {
      // Service is not initialized, so relay pool is null
      const result = await service.pollMessages();
      expect(result).toBe(0);
      expect(log).toHaveBeenCalledWith('debug', 'Polling skipped: relay pool not initialized');
    });

    it('returns 0 when no identities exist', async () => {
      const mockRelayPool = createMockRelayPool();
      (service as any).relayPool = mockRelayPool;

      const result = await service.pollMessages();
      expect(result).toBe(0);
      expect(log).toHaveBeenCalledWith('debug', 'Polling skipped: no identities');
    });

    it('polls identities and processes events through deduplication', async () => {
      // Create an identity with a contact
      const identity = await service.createIdentity({
        label: 'TestIdentity',
        nsec: 'test-secret',
        npub: 'npub1test'
      });
      await service.addContact({
        identityId: identity.id,
        npub: 'npub2contact',
        alias: 'Test Contact'
      });

      const mockEvent: NostrEvent = {
        id: 'event123',
        pubkey: 'abc123',
        created_at: Math.floor(Date.now() / 1000),
        kind: 4,
        tags: [['p', 'def456']],
        content: 'encrypted content',
        sig: 'signature'
      };

      const mockRelayPool = createMockRelayPool([mockEvent]);
      (service as any).relayPool = mockRelayPool;

      const result = await service.pollMessages();

      // Should have called querySync
      expect(mockRelayPool.querySync).toHaveBeenCalled();
      // Should have processed 1 event
      expect(result).toBe(1);
    });

    it('handles querySync failures gracefully', async () => {
      const identity = await service.createIdentity({
        label: 'TestIdentity',
        nsec: 'test-secret',
        npub: 'npub1test'
      });
      await service.addContact({
        identityId: identity.id,
        npub: 'npub2contact'
      });

      const mockRelayPool = createMockRelayPool(new Error('Network error'));
      (service as any).relayPool = mockRelayPool;

      // Should not throw, returns 0 on error
      const result = await service.pollMessages();
      expect(result).toBe(0);
      expect(log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Polling failed for identity')
      );
    });

    it('applies since filter to limit query scope', async () => {
      const identity = await service.createIdentity({
        label: 'TestIdentity',
        nsec: 'test-secret',
        npub: 'npub1test'
      });
      await service.addContact({
        identityId: identity.id,
        npub: 'npub2contact'
      });

      const mockRelayPool = createMockRelayPool();
      (service as any).relayPool = mockRelayPool;

      await service.pollMessages();

      // Verify querySync was called with a filter containing 'since'
      expect(mockRelayPool.querySync).toHaveBeenCalled();
      const callArgs = mockRelayPool.querySync.mock.calls[0] as unknown as [Array<{ since?: number }>];
      const filters = callArgs[0];

      // At least one filter should have a 'since' property
      expect(filters.some(f => typeof f.since === 'number')).toBe(true);
    });
  });

  describe('startPolling() / stopPolling()', () => {
    it('starts interval timer with specified interval', async () => {
      // Need an identity and contact so polling actually queries
      const identity = await service.createIdentity({
        label: 'TestIdentity',
        nsec: 'test-secret',
        npub: 'npub1test'
      });
      await service.addContact({
        identityId: identity.id,
        npub: 'npub2contact'
      });

      const mockRelayPool = createMockRelayPool();
      (service as any).relayPool = mockRelayPool;

      service.startPolling(10000);

      expect(log).toHaveBeenCalledWith('info', 'Message polling started (interval: 10000ms)');

      // Advance timers to trigger polling and flush async
      await jest.advanceTimersByTimeAsync(10000);

      // pollMessages should have been called (querySync triggered)
      expect(mockRelayPool.querySync).toHaveBeenCalled();
    });

    it('does not start timer when interval is 0', () => {
      service.startPolling(0);

      expect(log).toHaveBeenCalledWith('info', 'Message polling disabled');

      // No timer should be set
      jest.advanceTimersByTime(60000);

      // No polling should have occurred (relay pool is null anyway, but timer shouldn't run)
    });

    it('stops existing timer before starting new one (idempotent)', async () => {
      // Need an identity and contact so polling actually queries
      const identity = await service.createIdentity({
        label: 'TestIdentity',
        nsec: 'test-secret',
        npub: 'npub1test'
      });
      await service.addContact({
        identityId: identity.id,
        npub: 'npub2contact'
      });

      const mockRelayPool = createMockRelayPool();
      (service as any).relayPool = mockRelayPool;

      // Start with 5s interval
      service.startPolling(5000);

      // Start again with 10s interval (should stop previous)
      service.startPolling(10000);

      // Advance 5s - should NOT trigger polling (old timer stopped)
      await jest.advanceTimersByTimeAsync(5000);
      expect(mockRelayPool.querySync).not.toHaveBeenCalled();

      // Advance another 5s (total 10s) - should trigger polling
      await jest.advanceTimersByTimeAsync(5000);
      expect(mockRelayPool.querySync).toHaveBeenCalled();
    });

    it('clears timer on stopPolling', () => {
      const mockRelayPool = createMockRelayPool();
      (service as any).relayPool = mockRelayPool;

      service.startPolling(5000);
      service.stopPolling();

      expect(log).toHaveBeenCalledWith('info', 'Message polling stopped');

      // Advance timers - no polling should occur
      jest.advanceTimersByTime(10000);
      expect(mockRelayPool.querySync).not.toHaveBeenCalled();
    });

    it('stopPolling is safe to call when no timer is running', () => {
      // Should not throw
      expect(() => service.stopPolling()).not.toThrow();

      // Should not log (no timer to stop)
      expect(log).not.toHaveBeenCalledWith('info', 'Message polling stopped');
    });
  });
});
