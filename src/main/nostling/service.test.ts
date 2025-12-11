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
  service = new NostlingService(database, secretStore);
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
      ciphertext: 'hello',
      eventId: 'evt-1',
    });

    expect(incoming?.status).toBe('sent');
    const updatedContact = (await service.listContacts(identity.id)).find((c) => c.id === contact.id);
    expect(updatedContact?.state).toBe('connected');

    const discarded = await service.ingestIncomingMessage({
      identityId: identity.id,
      senderNpub: 'npub-unknown',
      recipientNpub: 'npub1',
      ciphertext: 'ignored',
    });
    expect(discarded).toBeNull();
    expect((log as jest.Mock).mock.calls.some((call) => `${call[1]}`.includes('unknown sender'))).toBe(true);
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
});
