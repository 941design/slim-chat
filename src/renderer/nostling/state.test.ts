/**
 * Unit tests for NostlingService relay configuration operations
 *
 * Tests verify:
 * - Editing relay URLs and persisting changes
 * - Adding new relays to defaults
 * - Removing relays from defaults
 * - Per-identity relay overrides
 * - Default relay seeding on initialize
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { NostlingService } from '../../main/nostling/service';
import { NostlingSecretStore } from '../../main/nostling/secret-store';
import { runMigrations } from '../../main/database/migrations';
import { NostlingRelayConfig, NostlingRelayEndpoint } from '../../shared/types';

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

jest.mock('../../main/logging', () => ({
  log: jest.fn(),
  setLogLevel: jest.fn(),
  getRecentLogs: jest.fn(),
}));

// In-memory secret store for tests
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
let secretStore: MemorySecretStore;
let service: NostlingService;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(async () => {
  database = new SQL.Database();
  await runMigrations(database);
  secretStore = new MemorySecretStore();
  service = new NostlingService(database, secretStore);
});

describe('NostlingService - Relay Configuration', () => {

  // ==========================================================================
  // Editing Relays
  // ==========================================================================

  describe('Editing Relays', () => {
    it('should update relay URL and persist changes', async () => {
      // Setup: Add initial relay
      const initialConfig: NostlingRelayConfig = {
        defaults: [{ url: 'wss://old.relay.com', read: true, write: true, createdAt: '2024-01-01T00:00:00Z' }],
      };
      await service.setRelayConfig(initialConfig);

      // Act: Update relay URL
      const updatedConfig: NostlingRelayConfig = {
        defaults: [{ url: 'wss://new.relay.com', read: true, write: true, createdAt: '2024-01-01T00:00:00Z' }],
      };
      const result = await service.setRelayConfig(updatedConfig);

      // Assert
      expect(result.defaults[0].url).toBe('wss://new.relay.com');

      // Verify persistence
      const loaded = await service.getRelayConfig();
      expect(loaded.defaults[0].url).toBe('wss://new.relay.com');
    });

    it('should toggle read permission and persist', async () => {
      const initialConfig: NostlingRelayConfig = {
        defaults: [{ url: 'wss://relay.com', read: true, write: true, createdAt: '2024-01-01T00:00:00Z' }],
      };
      await service.setRelayConfig(initialConfig);

      const updatedConfig: NostlingRelayConfig = {
        defaults: [{ url: 'wss://relay.com', read: false, write: true, createdAt: '2024-01-01T00:00:00Z' }],
      };
      const result = await service.setRelayConfig(updatedConfig);

      expect(result.defaults[0].read).toBe(false);
      expect(result.defaults[0].write).toBe(true);

      const loaded = await service.getRelayConfig();
      expect(loaded.defaults[0].read).toBe(false);
    });

    it('should toggle write permission and persist', async () => {
      const initialConfig: NostlingRelayConfig = {
        defaults: [{ url: 'wss://relay.com', read: true, write: true, createdAt: '2024-01-01T00:00:00Z' }],
      };
      await service.setRelayConfig(initialConfig);

      const updatedConfig: NostlingRelayConfig = {
        defaults: [{ url: 'wss://relay.com', read: true, write: false, createdAt: '2024-01-01T00:00:00Z' }],
      };
      const result = await service.setRelayConfig(updatedConfig);

      expect(result.defaults[0].write).toBe(false);
      expect(result.defaults[0].read).toBe(true);

      const loaded = await service.getRelayConfig();
      expect(loaded.defaults[0].write).toBe(false);
    });
  });

  // ==========================================================================
  // Adding Relays
  // ==========================================================================

  describe('Adding Relays', () => {
    it('should add a new relay to empty defaults', async () => {
      // Start with empty config
      const emptyConfig = await service.getRelayConfig();
      expect(emptyConfig.defaults).toHaveLength(0);

      // Add relay
      const newRelay: NostlingRelayEndpoint = {
        url: 'wss://new.relay.com',
        read: true,
        write: true,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const result = await service.setRelayConfig({ defaults: [newRelay] });

      expect(result.defaults).toHaveLength(1);
      expect(result.defaults[0].url).toBe('wss://new.relay.com');

      // Verify persistence
      const loaded = await service.getRelayConfig();
      expect(loaded.defaults).toHaveLength(1);
    });

    it('should add a new relay to existing defaults', async () => {
      const existingRelay: NostlingRelayEndpoint = {
        url: 'wss://existing.relay.com',
        read: true,
        write: true,
        createdAt: '2024-01-01T00:00:00Z',
      };
      await service.setRelayConfig({ defaults: [existingRelay] });

      const newRelay: NostlingRelayEndpoint = {
        url: 'wss://new.relay.com',
        read: true,
        write: true,
        createdAt: '2024-01-02T00:00:00Z',
      };
      const result = await service.setRelayConfig({ defaults: [existingRelay, newRelay] });

      expect(result.defaults).toHaveLength(2);
      expect(result.defaults.map((r) => r.url)).toContain('wss://existing.relay.com');
      expect(result.defaults.map((r) => r.url)).toContain('wss://new.relay.com');
    });

    it('should add per-identity relay override', async () => {
      const identityId = 'identity-123';
      const defaultRelay: NostlingRelayEndpoint = {
        url: 'wss://default.relay.com',
        read: true,
        write: true,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const identityRelay: NostlingRelayEndpoint = {
        url: 'wss://identity-specific.relay.com',
        read: true,
        write: false,
        createdAt: '2024-01-02T00:00:00Z',
      };

      const result = await service.setRelayConfig({
        defaults: [defaultRelay],
        perIdentity: { [identityId]: [identityRelay] },
      });

      expect(result.defaults).toHaveLength(1);
      expect(result.perIdentity?.[identityId]).toHaveLength(1);
      expect(result.perIdentity?.[identityId][0].url).toBe('wss://identity-specific.relay.com');
      expect(result.perIdentity?.[identityId][0].write).toBe(false);

      // Verify persistence
      const loaded = await service.getRelayConfig();
      expect(loaded.perIdentity?.[identityId]).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Removing Relays
  // ==========================================================================

  describe('Removing Relays', () => {
    it('should remove relay from defaults', async () => {
      const relay1: NostlingRelayEndpoint = {
        url: 'wss://relay1.com',
        read: true,
        write: true,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const relay2: NostlingRelayEndpoint = {
        url: 'wss://relay2.com',
        read: true,
        write: true,
        createdAt: '2024-01-02T00:00:00Z',
      };
      await service.setRelayConfig({ defaults: [relay1, relay2] });

      // Remove first relay
      const result = await service.setRelayConfig({ defaults: [relay2] });

      expect(result.defaults).toHaveLength(1);
      expect(result.defaults[0].url).toBe('wss://relay2.com');

      // Verify persistence
      const loaded = await service.getRelayConfig();
      expect(loaded.defaults).toHaveLength(1);
    });

    it('should remove all relays leaving empty defaults', async () => {
      const relay: NostlingRelayEndpoint = {
        url: 'wss://only.relay.com',
        read: true,
        write: true,
        createdAt: '2024-01-01T00:00:00Z',
      };
      await service.setRelayConfig({ defaults: [relay] });

      const result = await service.setRelayConfig({ defaults: [] });

      expect(result.defaults).toHaveLength(0);

      const loaded = await service.getRelayConfig();
      expect(loaded.defaults).toHaveLength(0);
    });

    it('should remove per-identity override', async () => {
      const identityId = 'identity-123';
      const defaultRelay: NostlingRelayEndpoint = {
        url: 'wss://default.relay.com',
        read: true,
        write: true,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const identityRelay: NostlingRelayEndpoint = {
        url: 'wss://identity.relay.com',
        read: true,
        write: true,
        createdAt: '2024-01-02T00:00:00Z',
      };

      await service.setRelayConfig({
        defaults: [defaultRelay],
        perIdentity: { [identityId]: [identityRelay] },
      });

      // Remove per-identity override by not including it
      const result = await service.setRelayConfig({ defaults: [defaultRelay] });

      expect(result.defaults).toHaveLength(1);
      expect(result.perIdentity).toBeUndefined();

      const loaded = await service.getRelayConfig();
      expect(loaded.perIdentity).toBeUndefined();
    });
  });

  // ==========================================================================
  // Get Relay Config
  // ==========================================================================

  describe('Get Relay Config', () => {
    it('should return empty defaults when no relays configured', async () => {
      const config = await service.getRelayConfig();
      expect(config.defaults).toHaveLength(0);
      expect(config.perIdentity).toBeUndefined();
    });

    it('should return all configured relays', async () => {
      const relay1: NostlingRelayEndpoint = {
        url: 'wss://relay1.com',
        read: true,
        write: false,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const relay2: NostlingRelayEndpoint = {
        url: 'wss://relay2.com',
        read: false,
        write: true,
        createdAt: '2024-01-02T00:00:00Z',
      };

      await service.setRelayConfig({ defaults: [relay1, relay2] });
      const config = await service.getRelayConfig();

      expect(config.defaults).toHaveLength(2);
      expect(config.defaults[0].read).toBe(true);
      expect(config.defaults[0].write).toBe(false);
      expect(config.defaults[1].read).toBe(false);
      expect(config.defaults[1].write).toBe(true);
    });
  });

  // ==========================================================================
  // Multiple Identity Overrides
  // ==========================================================================

  describe('Multiple Identity Overrides', () => {
    it('should support multiple identities with different relay configs', async () => {
      const defaultRelay: NostlingRelayEndpoint = {
        url: 'wss://default.relay.com',
        read: true,
        write: true,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const identity1Relay: NostlingRelayEndpoint = {
        url: 'wss://identity1.relay.com',
        read: true,
        write: false,
        createdAt: '2024-01-02T00:00:00Z',
      };
      const identity2Relay: NostlingRelayEndpoint = {
        url: 'wss://identity2.relay.com',
        read: false,
        write: true,
        createdAt: '2024-01-03T00:00:00Z',
      };

      const result = await service.setRelayConfig({
        defaults: [defaultRelay],
        perIdentity: {
          'identity-1': [identity1Relay],
          'identity-2': [identity2Relay],
        },
      });

      expect(result.defaults).toHaveLength(1);
      expect(result.perIdentity?.['identity-1']).toHaveLength(1);
      expect(result.perIdentity?.['identity-2']).toHaveLength(1);
      expect(result.perIdentity?.['identity-1'][0].write).toBe(false);
      expect(result.perIdentity?.['identity-2'][0].read).toBe(false);

      // Verify persistence
      const loaded = await service.getRelayConfig();
      expect(Object.keys(loaded.perIdentity ?? {})).toHaveLength(2);
    });
  });
});
