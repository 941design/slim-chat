import { describe, expect, it, beforeAll, beforeEach, jest } from '@jest/globals';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { NostlingService } from './service';
import { NostlingSecretStore } from './secret-store';
import { runMigrations } from '../database/migrations';

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

describe('Bug: Message Deduplication on Restart', () => {
  /**
   * Regression test: Messages are deduplicated after application restart
   * Expected: Each Nostr event_id appears exactly once per conversation
   * Actual: Same message (same event_id in same conversation) rejected on duplicate ingestion
   *
   * Bug report: bug-reports/duplicate-event-ingestion.md
   * Fixed: 2025-12-13
   *
   * Root cause: No database-level unique constraint on (identity_id, contact_id, event_id)
   * to prevent duplicates per conversation.
   */
  it('prevents duplicate messages after simulated restart (fix verification)', async () => {
    // Simulate initial session
    let database = new SQL.Database();
    await runMigrations(database);
    const secretStore = new MemorySecretStore();

    let service = new NostlingService(database, secretStore, '/tmp/nostling-test');

    // Setup: Create identity and contact
    const identity = await service.createIdentity({
      label: 'Receiver',
      nsec: 'secret1',
      npub: 'npub1receiver'
    });
    const contact = await service.addContact({
      identityId: identity.id,
      npub: 'npub2sender'
    });

    // First session: Receive a message with event_id="evt-abc123"
    const message1 = await service.ingestIncomingMessage({
      identityId: identity.id,
      senderNpub: 'npub2sender',
      recipientNpub: 'npub1receiver',
      content: 'Hello from relay A',
      eventId: 'evt-abc123',
      timestamp: '2025-01-01T12:00:00.000Z'
    });

    expect(message1).not.toBeNull();

    let messages = await service.listMessages(identity.id, contact.id);
    // Filter out welcome message (queued outgoing message)
    const incomingMessages = messages.filter(m => m.direction === 'incoming');
    expect(incomingMessages).toHaveLength(1);
    expect(incomingMessages[0].eventId).toBe('evt-abc123');

    // Export database state (simulating persistence)
    const dbExport = database.export();

    // SIMULATE RESTART: Create new service instance with restored database
    // This clears the in-memory seenEventIds Set
    database = new SQL.Database(dbExport);
    service = new NostlingService(database, secretStore, '/tmp/nostling-test');

    // After restart: Same message arrives again (from another relay or reconnection)
    const message2 = await service.ingestIncomingMessage({
      identityId: identity.id,
      senderNpub: 'npub2sender',
      recipientNpub: 'npub1receiver',
      content: 'Hello from relay A', // Same content
      eventId: 'evt-abc123',         // Same event_id!
      timestamp: '2025-01-01T12:00:00.000Z'
    });

    // FIX: Message is rejected because database constraint prevents duplicates
    expect(message2).toBeNull();

    // Check database for duplicates
    messages = await service.listMessages(identity.id, contact.id);
    const incomingMessagesAfterRestart = messages.filter(m => m.direction === 'incoming');

    // VERIFIED: Still only 1 message (deduplicated by event_id)
    expect(incomingMessagesAfterRestart).toHaveLength(1);

    database.close();
  });

  it('verifies database schema has unique constraint on (identity_id, contact_id, event_id)', async () => {
    const database = new SQL.Database();
    await runMigrations(database);

    // Query schema to check for unique constraint on composite key
    const indexResult = database.exec(
      "SELECT name, sql FROM sqlite_master WHERE type='index' AND name='idx_nostr_messages_event_id_unique'"
    );

    expect(indexResult).toHaveLength(1);
    expect(indexResult[0]?.values[0]?.[0]).toBe('idx_nostr_messages_event_id_unique');

    const indexSql = indexResult[0]?.values[0]?.[1] as string;
    expect(indexSql).toMatch(/CREATE UNIQUE INDEX/i);
    expect(indexSql).toMatch(/identity_id, contact_id, event_id/);
    expect(indexSql).toMatch(/WHERE event_id IS NOT NULL/);

    database.close();
  });

  it('verifies database-level deduplication within same session', async () => {
    // Initial session
    const database = new SQL.Database();
    await runMigrations(database);
    const secretStore = new MemorySecretStore();

    const service = new NostlingService(database, secretStore, '/tmp/nostling-test');

    const identity = await service.createIdentity({
      label: 'Test',
      nsec: 'secret',
      npub: 'npub1'
    });
    const contact = await service.addContact({
      identityId: identity.id,
      npub: 'npub2'
    });

    // Ingest message twice in same session
    await service.ingestIncomingMessage({
      identityId: identity.id,
      senderNpub: 'npub2',
      recipientNpub: 'npub1',
      content: 'test',
      eventId: 'evt-test',
    });

    const message2 = await service.ingestIncomingMessage({
      identityId: identity.id,
      senderNpub: 'npub2',
      recipientNpub: 'npub1',
      content: 'test',
      eventId: 'evt-test', // Same event_id
    });

    // Database-level dedup prevents duplicate
    expect(message2).toBeNull();

    const messages = await service.listMessages(identity.id, contact.id);
    const incoming = messages.filter(m => m.direction === 'incoming');

    // Verify only one message exists
    expect(incoming).toHaveLength(1);

    database.close();
  });
});
