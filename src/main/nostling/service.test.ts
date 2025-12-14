import { describe, expect, it, beforeAll, beforeEach, jest } from '@jest/globals';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { NostlingService } from './service';
import { NostlingSecretStore } from './secret-store';
import { runMigrations } from '../database/migrations';
import { log } from '../logging';
import { generateKeypair } from './crypto';

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

  it('marks contacts as deleted while removing them from the active list', async () => {
    const identity = await service.createIdentity({ label: 'Owner', nsec: 'secret', npub: 'npub-owner' });
    const contact = await service.addContact({ identityId: identity.id, npub: 'npub-contact', alias: 'Friend' });

    await service.removeContact(contact.id);

    const contacts = await service.listContacts(identity.id);
    expect(contacts).toHaveLength(0);

    const stmt = database.prepare('SELECT deleted_at FROM nostr_contacts WHERE id = ? LIMIT 1');
    stmt.bind([contact.id]);
    expect(stmt.step()).toBe(true);
    const deletedAt = stmt.getAsObject().deleted_at as string | null;
    stmt.free();

    expect(deletedAt).not.toBeNull();
  });

  it('allows recreating a contact npub after a soft delete', async () => {
    const identity = await service.createIdentity({ label: 'Owner', nsec: 'secret', npub: 'npub-owner' });
    const first = await service.addContact({ identityId: identity.id, npub: 'npub-reuse', alias: 'First' });

    await service.removeContact(first.id);

    const second = await service.addContact({ identityId: identity.id, npub: 'npub-reuse', alias: 'Second' });
    expect(second.id).not.toBe(first.id);
    expect(second.alias).toBe('Second');
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

  it('builds kind-4 relay filters from the contact whitelist (placeholder npubs)', async () => {
    // Test with placeholder npubs (passthrough behavior for tests)
    const identity = await service.createIdentity({ label: 'FilterOwner', nsec: 'secret', npub: 'npub1' });
    await service.addContact({ identityId: identity.id, npub: 'npub2' });
    await service.addContact({ identityId: identity.id, npub: 'npub3', alias: 'Friend' });

    const filters = await service.getKind4Filters(identity.id);
    expect(filters).toEqual([
      { kinds: [4], authors: ['npub2', 'npub3'], '#p': ['npub1'] },
      { kinds: [4], authors: ['npub1'], '#p': ['npub2', 'npub3'] },
    ]);
  });

  it('converts valid npubs to hex pubkeys in relay filters', async () => {
    // Generate real keypairs to test hex conversion
    const ownerKeypair = generateKeypair();
    const contact1Keypair = generateKeypair();
    const contact2Keypair = generateKeypair();

    const identity = await service.createIdentity({
      label: 'RealFilterOwner',
      nsec: ownerKeypair.nsec,
    });
    await service.addContact({ identityId: identity.id, npub: contact1Keypair.keypair.npub });
    await service.addContact({ identityId: identity.id, npub: contact2Keypair.keypair.npub });

    const filters = await service.getKind4Filters(identity.id);

    // Verify filters use hex pubkeys (64-char lowercase hex strings)
    expect(filters).toHaveLength(2);
    expect(filters[0].authors).toEqual([contact1Keypair.keypair.pubkeyHex, contact2Keypair.keypair.pubkeyHex]);
    expect(filters[0]['#p']).toEqual([ownerKeypair.keypair.pubkeyHex]);
    expect(filters[1].authors).toEqual([ownerKeypair.keypair.pubkeyHex]);
    expect(filters[1]['#p']).toEqual([contact1Keypair.keypair.pubkeyHex, contact2Keypair.keypair.pubkeyHex]);

    // Verify hex format (64 lowercase hex chars)
    const hexPattern = /^[0-9a-f]{64}$/;
    filters[0].authors!.forEach(author => expect(author).toMatch(hexPattern));
    filters[0]['#p']!.forEach(p => expect(p).toMatch(hexPattern));
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

  it('deduplicates events per-identity for mutual connections', async () => {
    /**
     * Regression test: Per-identity event deduplication for mutual connections
     *
     * Bug report: Mutual connections not showing received messages
     * Fixed: 2025-12-12
     * Root cause: seenEventIds was global across all identities, so when both identities
     *             subscribed to events, only the first identity to process an event would
     *             receive it - the second would skip it as "already seen".
     *
     * Protection: Ensures that when two local identities have each other as contacts,
     *             an incoming event from one can be processed independently by both.
     */
    const identityA = await service.createIdentity({ label: 'Alice', nsec: 'secretA', npub: 'npubA' });
    const identityB = await service.createIdentity({ label: 'Bob', nsec: 'secretB', npub: 'npubB' });

    // Create mutual contacts
    const contactBonA = await service.addContact({ identityId: identityA.id, npub: 'npubB' });
    const contactAonB = await service.addContact({ identityId: identityB.id, npub: 'npubA' });

    // Simulate an incoming event that would match both identities' subscriptions
    // (e.g., A sends a message to B - B receives it, but A also sees it in their "sent" subscription)
    const eventId = 'shared-event-123';

    // Ingest the same event for both identities (simulating both subscriptions receiving it)
    const msgForB = await service.ingestIncomingMessage({
      identityId: identityB.id,
      senderNpub: 'npubA',
      recipientNpub: 'npubB',
      content: 'Hello Bob!',
      eventId,
    });

    const msgForA = await service.ingestIncomingMessage({
      identityId: identityA.id,
      senderNpub: 'npubB',
      recipientNpub: 'npubA',
      content: 'Hello Alice!',
      eventId, // Same event ID - would have been deduplicated globally before the fix
    });

    // Both messages should be stored (the fix uses per-identity deduplication key)
    expect(msgForB).not.toBeNull();
    expect(msgForA).not.toBeNull();

    // Verify messages are stored in correct conversations
    const messagesForB = await service.listMessages(identityB.id, contactAonB.id);
    const messagesForA = await service.listMessages(identityA.id, contactBonA.id);

    expect(messagesForB.some((m) => m.content === 'Hello Bob!')).toBe(true);
    expect(messagesForA.some((m) => m.content === 'Hello Alice!')).toBe(true);
  });
});
