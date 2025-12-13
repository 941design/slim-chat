import { describe, expect, it, beforeAll, beforeEach, jest } from '@jest/globals';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { NostlingService } from './service';
import { NostlingSecretStore } from './secret-store';
import { runMigrations } from '../database/migrations';

/**
 * Bug reproduction test: Duplicate event ingestion
 *
 * Bug: The same Nostr event can be ingested multiple times, creating duplicate messages
 * Expected: Each event_id should be ingested only once
 * Actual: Multiple message records created for the same event_id
 * Bug report: bug-reports/duplicate-event-ingestion.md
 *
 * This test verifies that:
 * 1. The first ingestion succeeds
 * 2. The second ingestion with same event_id returns null (silent deduplication)
 * 3. Only ONE message record exists in the database
 */

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

beforeAll(async () => {
  SQL = await initSqlJs();
});

describe('Bug: Duplicate Event Ingestion', () => {
  let database: Database;
  let secretStore: MemorySecretStore;
  let service: NostlingService;

  beforeEach(async () => {
    database = new SQL.Database();
    await runMigrations(database);
    secretStore = new MemorySecretStore();
    service = new NostlingService(database, secretStore, '/tmp/nostling-test');
  });

  it('should prevent duplicate event ingestion', async () => {
    // Setup: Create identity and contact
    const identity = await service.createIdentity({
      label: 'Receiver',
      nsec: 'secret1',
      npub: 'npub1receiver'
    });
    await service.addContact({
      identityId: identity.id,
      npub: 'npub2sender'
    });

    const identityId = identity.id;
    const senderNpub = 'npub2sender';
    const recipientNpub = 'npub1receiver';
    const eventId = 'test-event-id-12345';

    // First ingestion - should succeed
    const result1 = await service.ingestIncomingMessage({
      identityId,
      senderNpub,
      recipientNpub,
      content: 'Test message',
      eventId,
      timestamp: '2025-12-13T12:00:00.000Z',
    });

    expect(result1).not.toBeNull();
    expect(result1?.eventId).toBe(eventId);

    // Second ingestion with same event_id - should return null
    const result2 = await service.ingestIncomingMessage({
      identityId,
      senderNpub,
      recipientNpub,
      content: 'Test message duplicate',
      eventId,
      timestamp: '2025-12-13T12:00:01.000Z',
    });

    expect(result2).toBeNull();

    // Verify only ONE message exists in database
    const stmt = database.prepare('SELECT COUNT(*) as count FROM nostr_messages WHERE event_id = ?');
    stmt.bind([eventId]);
    stmt.step();
    const row = stmt.getAsObject() as { count: number };
    stmt.free();

    expect(row.count).toBe(1);
  });

  it('should allow messages without event_id', async () => {
    // Setup: Create identity and contact
    const identity = await service.createIdentity({
      label: 'Receiver',
      nsec: 'secret1',
      npub: 'npub1receiver'
    });
    await service.addContact({
      identityId: identity.id,
      npub: 'npub2sender'
    });

    const identityId = identity.id;
    const senderNpub = 'npub2sender';
    const recipientNpub = 'npub1receiver';

    // Two messages without event_id - both should succeed
    const result1 = await service.ingestIncomingMessage({
      identityId,
      senderNpub,
      recipientNpub,
      content: 'Message without event_id 1',
      timestamp: '2025-12-13T12:00:00.000Z',
    });

    const result2 = await service.ingestIncomingMessage({
      identityId,
      senderNpub,
      recipientNpub,
      content: 'Message without event_id 2',
      timestamp: '2025-12-13T12:00:01.000Z',
    });

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();

    // Verify both messages exist (count only incoming messages from our test)
    const stmt = database.prepare(
      "SELECT COUNT(*) as count FROM nostr_messages WHERE event_id IS NULL AND direction = 'incoming'"
    );
    stmt.step();
    const row = stmt.getAsObject() as { count: number };
    stmt.free();

    expect(row.count).toBe(2);
  });

  it('should allow same event_id across different conversations (per-conversation deduplication)', async () => {
    // Setup: Create two identities with different contacts
    const identity1 = await service.createIdentity({
      label: 'Alice',
      nsec: 'secret1',
      npub: 'npub1alice'
    });
    const identity2 = await service.createIdentity({
      label: 'Bob',
      nsec: 'secret2',
      npub: 'npub1bob'
    });

    await service.addContact({
      identityId: identity1.id,
      npub: 'npub2sender'
    });
    await service.addContact({
      identityId: identity2.id,
      npub: 'npub2sender'
    });

    const eventId = 'shared-event-id-12345';

    // Same event_id ingested for identity1's conversation with sender
    const result1 = await service.ingestIncomingMessage({
      identityId: identity1.id,
      senderNpub: 'npub2sender',
      recipientNpub: 'npub1alice',
      content: 'Message to Alice',
      eventId,
      timestamp: '2025-12-13T12:00:00.000Z',
    });

    // Same event_id ingested for identity2's conversation with sender - should succeed
    const result2 = await service.ingestIncomingMessage({
      identityId: identity2.id,
      senderNpub: 'npub2sender',
      recipientNpub: 'npub1bob',
      content: 'Message to Bob',
      eventId,
      timestamp: '2025-12-13T12:00:01.000Z',
    });

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();

    // Verify both messages exist with same event_id in different conversations
    const stmt = database.prepare('SELECT COUNT(*) as count FROM nostr_messages WHERE event_id = ?');
    stmt.bind([eventId]);
    stmt.step();
    const row = stmt.getAsObject() as { count: number };
    stmt.free();

    expect(row.count).toBe(2);
  });
});
