import { describe, expect, it, beforeAll, beforeEach, jest } from '@jest/globals';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { NostlingService } from './service';
import { NostlingSecretStore } from './secret-store';
import { runMigrations } from '../database/migrations';
import { log } from '../logging';

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
let database: Database;
let service: NostlingService;
let secretStore: MemorySecretStore;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(async () => {
  database = new SQL.Database();
  await runMigrations(database);
  secretStore = new MemorySecretStore();
  service = new NostlingService(database, secretStore, '/tmp/nostling-test');
  (log as jest.Mock).mockClear();
});

describe('NostlingService', () => {
  it('creates identities using the secret store and persists them', async () => {
    const identity = await service.createIdentity({ label: 'Main', nsec: 'secret', npub: 'npub1' });
    const identities = await service.listIdentities();

    expect(identity.secretRef).toBe('ref:1');
    expect(identities).toHaveLength(1);
    expect(identities[0].npub).toBe('npub1');
  });

  it('queues a welcome message for new contacts and flushes when online', async () => {
    const identity = await service.createIdentity({ label: 'Sender', nsec: 'secret', npub: 'npub1' });
    const contact = await service.addContact({ identityId: identity.id, npub: 'npub2' });

    let messages = await service.listMessages(identity.id, contact.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe('queued');
    expect(messages[0].direction).toBe('outgoing');

    await service.setOnline(true);
    messages = await service.listMessages(identity.id, contact.id);
    expect(messages[0].status).toBe('sent');
  });

  it('marks pending contacts connected when receiving a message and discards unknown senders', async () => {
    const identity = await service.createIdentity({ label: 'Receiver', nsec: 'secret', npub: 'npub1' });
    const contact = await service.addContact({ identityId: identity.id, npub: 'npub2' });

    const incoming = await service.ingestIncomingMessage({
      identityId: identity.id,
      senderNpub: 'npub2',
      recipientNpub: 'npub1',
      content: 'hello',
      eventId: 'evt-1',
    });

    expect(incoming?.status).toBe('sent');
    const updatedContact = (await service.listContacts(identity.id)).find((c) => c.id === contact.id);
    expect(updatedContact?.state).toBe('connected');

    const discarded = await service.ingestIncomingMessage({
      identityId: identity.id,
      senderNpub: 'npub-unknown',
      recipientNpub: 'npub1',
      content: 'ignored',
    });
    expect(discarded).toBeNull();
    expect((log as jest.Mock).mock.calls.some((call) => `${call[1]}`.includes('unknown sender'))).toBe(true);
  });

  it('logs and discards decryption failures without surfacing them', async () => {
    const identity = await service.createIdentity({ label: 'Receiver', nsec: 'secret', npub: 'npub1' });

    const result = await service.ingestIncomingMessage({
      identityId: identity.id,
      senderNpub: 'npub2',
      recipientNpub: 'npub1',
      content: 'garbage',
      decryptionFailed: true,
    });

    expect(result).toBeNull();
    expect((log as jest.Mock).mock.calls.some((call) => `${call[1]}`.includes('decryption failure'))).toBe(true);
  });

  it('exposes the outgoing queue with status helpers', async () => {
    const identity = await service.createIdentity({ label: 'Sender', nsec: 'secret', npub: 'npub1' });
    const contact = await service.addContact({ identityId: identity.id, npub: 'npub2' });

    let queue = await service.getOutgoingQueue(identity.id);
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe('queued');

    const sending = await service.markMessageSending(queue[0].id);
    expect(sending.status).toBe('sending');

    const sent = await service.markMessageSent(queue[0].id, 'evt-1');
    expect(sent.status).toBe('sent');
    expect(sent.eventId).toBe('evt-1');

    queue = await service.getOutgoingQueue(identity.id);
    expect(queue).toHaveLength(0);
  });

  it('marks messages as error and logs when relay publish fails', async () => {
    const identity = await service.createIdentity({ label: 'Sender', nsec: 'secret', npub: 'npub1' });
    const contact = await service.addContact({ identityId: identity.id, npub: 'npub2' });

    // Force offline to keep message queued
    const queued = await service.sendMessage({ identityId: identity.id, contactId: contact.id, plaintext: 'hello' });

    // Simulate relay failure during flush
    (service as any).markMessageSent = jest.fn(() => {
      throw new Error('relay down');
    });

    await service.setOnline(true);

    const messages = await service.listMessages(identity.id, contact.id);
    expect(messages.find((message) => message.id === queued.id)?.status).toBe('error');
    expect((log as jest.Mock).mock.calls.some((call) => `${call[1]}`.includes('Relay publish failed'))).toBe(true);
  });

  it('builds kind-4 relay filters from the contact whitelist', async () => {
    const identity = await service.createIdentity({ label: 'FilterOwner', nsec: 'secret', npub: 'npub1' });
    await service.addContact({ identityId: identity.id, npub: 'npub2' });
    await service.addContact({ identityId: identity.id, npub: 'npub3', alias: 'Friend' });

    const filters = await service.getKind4Filters(identity.id);
    expect(filters).toEqual([
      { kinds: [4], authors: ['npub2', 'npub3'], '#p': ['npub1'] },
      { kinds: [4], authors: ['npub1'], '#p': ['npub2', 'npub3'] },
    ]);
  });

  it('retries failed messages by resetting status to queued', async () => {
    const identity = await service.createIdentity({ label: 'Retry', nsec: 'secret', npub: 'npub1' });
    const contact = await service.addContact({ identityId: identity.id, npub: 'npub2' });

    // Send a message while offline
    const msg = await service.sendMessage({ identityId: identity.id, contactId: contact.id, plaintext: 'hello' });

    // Manually mark it as error to simulate relay failure
    await service.markMessageError(msg.id);

    let messages = await service.listMessages(identity.id, contact.id);
    expect(messages.find((m) => m.id === msg.id)?.status).toBe('error');

    // Retry failed messages
    const retried = await service.retryFailedMessages();
    expect(retried.length).toBe(1);
    expect(retried[0].status).toBe('queued');

    // Verify in DB
    messages = await service.listMessages(identity.id, contact.id);
    expect(messages.find((m) => m.id === msg.id)?.status).toBe('queued');
  });

  it('preserves relay read/write flags during initialization', async () => {
    /**
     * Regression test: Relay endpoint read/write flags preserved during initialization
     *
     * Bug report: bug-reports/relay-publish-all-failed-report.md
     * Fixed: 2025-12-12
     * Root cause: Relay read/write flags were dropped when mapping NostlingRelayEndpoint to RelayEndpoint
     *
     * Protection: Prevents relay endpoints from losing read/write configuration during service initialization,
     * which would cause message publishing to fail by filtering out all writable relays.
     */
    const identity = await service.createIdentity({ label: 'Test', nsec: 'secret', npub: 'npub1' });

    // Set relays with specific read/write flags
    await service.setRelaysForIdentity(identity.id, [
      {
        url: 'wss://test-relay.example.com',
        read: true,
        write: false, // Explicitly set to false
        order: 0,
      },
      {
        url: 'wss://write-relay.example.com',
        read: false,
        write: true, // Explicitly set to true
        order: 1,
      },
    ]);

    // Reload relays (simulates what happens during initialization)
    const relays = await service.getRelaysForIdentity(identity.id);

    // Verify flags are preserved
    expect(relays).toHaveLength(2);

    const testRelay = relays.find((r) => r.url === 'wss://test-relay.example.com');
    expect(testRelay?.read).toBe(true);
    expect(testRelay?.write).toBe(false);

    const writeRelay = relays.find((r) => r.url === 'wss://write-relay.example.com');
    expect(writeRelay?.read).toBe(false);
    expect(writeRelay?.write).toBe(true);
  });
});
