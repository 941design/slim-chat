import { randomUUID } from 'crypto';
import { Database } from 'sql.js';
import {
  AddContactRequest,
  CreateIdentityRequest,
  NostlingContact,
  NostlingContactState,
  NostlingIdentity,
  NostlingMessage,
  NostlingMessageDirection,
  NostlingMessageStatus,
  NostlingRelayConfig,
  NostlingRelayEndpoint,
} from '../../shared/types';
import { log } from '../logging';
import { NostlingSecretStore } from './secret-store';

interface RelayRow {
  id: string;
  identity_id: string | null;
  url: string;
  read: number;
  write: number;
  created_at: string;
}

interface IdentityRow {
  id: string;
  npub: string;
  secret_ref: string;
  label: string;
  relays: string | null;
  created_at: string;
}

interface ContactRow {
  id: string;
  identity_id: string;
  npub: string;
  alias: string;
  state: NostlingContactState;
  created_at: string;
  last_message_at: string | null;
}

interface MessageRow {
  id: string;
  identity_id: string;
  contact_id: string;
  sender_npub: string;
  recipient_npub: string;
  ciphertext: string;
  event_id: string | null;
  timestamp: string;
  status: NostlingMessageStatus;
  direction: NostlingMessageDirection;
}

export interface NostlingServiceOptions {
  /**
   * When true, queued messages will be marked as sent immediately.
   * Defaults to false to reflect offline-first behavior until explicitly set online.
   */
  online?: boolean;
  /**
   * Optional override for the welcome message body used during handshake.
   */
  welcomeMessage?: string;
}

export class NostlingService {
  private online: boolean;
  private readonly welcomeMessage: string;

  constructor(private readonly database: Database, private readonly secretStore: NostlingSecretStore, options: NostlingServiceOptions = {}) {
    this.online = Boolean(options.online);
    this.welcomeMessage = options.welcomeMessage || 'nostling:welcome';
  }

  async listIdentities(): Promise<NostlingIdentity[]> {
    const stmt = this.database.prepare(
      'SELECT id, npub, secret_ref, label, relays, created_at FROM nostr_identities ORDER BY created_at ASC'
    );

    const identities: NostlingIdentity[] = [];
    while (stmt.step()) {
      identities.push(this.mapIdentityRow(stmt.getAsObject() as unknown as IdentityRow));
    }
    stmt.free();
    return identities;
  }

  async createIdentity(request: CreateIdentityRequest): Promise<NostlingIdentity> {
    if (!request?.label || !request.label.trim()) {
      throw new Error('Identity label is required');
    }

    const npub = request.npub?.trim();
    if (!npub) {
      throw new Error('npub is required to create an identity');
    }

    const secretRef = await this.resolveSecretRef(request);
    const id = randomUUID();
    const now = new Date().toISOString();
    const relaysJson = request.relays && request.relays.length > 0 ? JSON.stringify(request.relays) : null;

    this.database.run(
      'INSERT INTO nostr_identities (id, npub, secret_ref, label, relays, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, npub, secretRef, request.label, relaysJson, now]
    );

    log('info', `Created nostling identity ${id}`);
    return {
      id,
      npub,
      secretRef,
      label: request.label,
      relays: request.relays,
      createdAt: now,
    };
  }

  async removeIdentity(id: string): Promise<void> {
    this.database.run('DELETE FROM nostr_messages WHERE identity_id = ?', [id]);
    this.database.run('DELETE FROM nostr_contacts WHERE identity_id = ?', [id]);
    this.database.run('DELETE FROM nostr_relays WHERE identity_id = ?', [id]);
    this.database.run('DELETE FROM nostr_identities WHERE id = ?', [id]);
    log('info', `Removed nostling identity ${id}`);
  }

  async listContacts(identityId: string): Promise<NostlingContact[]> {
    const stmt = this.database.prepare(
      'SELECT id, identity_id, npub, alias, state, created_at, last_message_at FROM nostr_contacts WHERE identity_id = ? ORDER BY created_at ASC'
    );
    stmt.bind([identityId]);

    const contacts: NostlingContact[] = [];
    while (stmt.step()) {
      contacts.push(this.mapContactRow(stmt.getAsObject() as unknown as ContactRow));
    }
    stmt.free();
    return contacts;
  }

  async addContact(request: AddContactRequest): Promise<NostlingContact> {
    this.assertIdentityExists(request.identityId);

    const id = randomUUID();
    const now = new Date().toISOString();
    const alias = request.alias?.trim() || request.npub;

    this.database.run(
      'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, request.identityId, request.npub, alias, 'pending', now]
    );

    log('info', `Added nostling contact ${id} for identity ${request.identityId}`);

    // Kick off handshake by sending welcome message
    await this.enqueueOutgoingMessage({
      identityId: request.identityId,
      contactId: id,
      senderNpub: this.getIdentityNpub(request.identityId),
      recipientNpub: request.npub,
      plaintext: this.welcomeMessage,
    });

    return {
      id,
      identityId: request.identityId,
      npub: request.npub,
      alias,
      state: 'pending',
      createdAt: now,
    };
  }

  async removeContact(contactId: string): Promise<void> {
    this.database.run('DELETE FROM nostr_messages WHERE contact_id = ?', [contactId]);
    this.database.run('DELETE FROM nostr_contacts WHERE id = ?', [contactId]);
    log('info', `Removed nostling contact ${contactId}`);
  }

  async markContactConnected(contactId: string): Promise<NostlingContact> {
    const contact = this.getContact(contactId);
    if (contact.state === 'connected') {
      return contact;
    }

    const now = new Date().toISOString();
    this.database.run('UPDATE nostr_contacts SET state = ?, last_message_at = ? WHERE id = ?', ['connected', now, contactId]);
    log('info', `Contact ${contactId} marked as connected`);
    return { ...contact, state: 'connected', lastMessageAt: now };
  }

  async listMessages(identityId: string, contactId: string): Promise<NostlingMessage[]> {
    const stmt = this.database.prepare(
      'SELECT id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, event_id, timestamp, status, direction FROM nostr_messages WHERE identity_id = ? AND contact_id = ? ORDER BY timestamp ASC'
    );
    stmt.bind([identityId, contactId]);

    const messages: NostlingMessage[] = [];
    while (stmt.step()) {
      messages.push(this.mapMessageRow(stmt.getAsObject() as unknown as MessageRow));
    }
    stmt.free();
    return messages;
  }

  async sendMessage(request: { identityId: string; contactId: string; plaintext: string }): Promise<NostlingMessage> {
    if (!request.plaintext || !request.plaintext.trim()) {
      throw new Error('Message body is required');
    }

    const contact = this.getContact(request.contactId);
    if (contact.identityId !== request.identityId) {
      throw new Error('Contact does not belong to the specified identity');
    }

    return this.enqueueOutgoingMessage({
      identityId: request.identityId,
      contactId: request.contactId,
      senderNpub: this.getIdentityNpub(request.identityId),
      recipientNpub: contact.npub,
      plaintext: request.plaintext,
    });
  }

  async ingestIncomingMessage(options: {
    identityId: string;
    senderNpub: string;
    recipientNpub: string;
    ciphertext: string;
    eventId?: string;
    timestamp?: string;
  }): Promise<NostlingMessage | null> {
    const contact = this.findContactByNpub(options.identityId, options.senderNpub);
    if (!contact) {
      log('warn', `Discarding nostling message from unknown sender ${options.senderNpub}`);
      return null;
    }

    const now = options.timestamp || new Date().toISOString();
    const id = randomUUID();

    this.database.run(
      'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, event_id, timestamp, status, direction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        options.identityId,
        contact.id,
        options.senderNpub,
        options.recipientNpub,
        options.ciphertext,
        options.eventId || null,
        now,
        'sent',
        'incoming',
      ]
    );

    if (contact.state === 'pending') {
      await this.markContactConnected(contact.id);
    }

    this.bumpContactLastMessage(contact.id, now);
    log('info', `Stored incoming nostling message ${id}`);

    return {
      id,
      identityId: options.identityId,
      contactId: contact.id,
      senderNpub: options.senderNpub,
      recipientNpub: options.recipientNpub,
      ciphertext: options.ciphertext,
      eventId: options.eventId,
      timestamp: now,
      status: 'sent',
      direction: 'incoming',
    };
  }

  async discardUnknown(eventId: string): Promise<void> {
    log('warn', `Discarded nostling event from unknown sender: ${eventId}`);
  }

  async getRelayConfig(): Promise<NostlingRelayConfig> {
    const stmt = this.database.prepare(
      'SELECT id, identity_id, url, read, write, created_at FROM nostr_relays ORDER BY created_at ASC'
    );

    const defaults: NostlingRelayEndpoint[] = [];
    const perIdentity: Record<string, NostlingRelayEndpoint[]> = {};

    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as RelayRow;
      const endpoint: NostlingRelayEndpoint = {
        url: row.url,
        read: Boolean(row.read),
        write: Boolean(row.write),
        createdAt: this.toIso(row.created_at),
      };

      if (row.identity_id) {
        perIdentity[row.identity_id] = perIdentity[row.identity_id] || [];
        perIdentity[row.identity_id].push(endpoint);
      } else {
        defaults.push(endpoint);
      }
    }

    stmt.free();
    return { defaults, perIdentity: Object.keys(perIdentity).length > 0 ? perIdentity : undefined };
  }

  async setRelayConfig(config: NostlingRelayConfig): Promise<NostlingRelayConfig> {
    this.database.run('DELETE FROM nostr_relays');

    const now = new Date().toISOString();
    for (const endpoint of config.defaults) {
      this.database.run('INSERT INTO nostr_relays (id, identity_id, url, read, write, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
        randomUUID(),
        null,
        endpoint.url,
        endpoint.read ? 1 : 0,
        endpoint.write ? 1 : 0,
        endpoint.createdAt || now,
      ]);
    }

    if (config.perIdentity) {
      for (const [identityId, endpoints] of Object.entries(config.perIdentity)) {
        for (const endpoint of endpoints) {
          this.database.run(
            'INSERT INTO nostr_relays (id, identity_id, url, read, write, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [randomUUID(), identityId, endpoint.url, endpoint.read ? 1 : 0, endpoint.write ? 1 : 0, endpoint.createdAt || now]
          );
        }
      }
    }

    log('info', 'Updated nostling relay configuration');
    return this.getRelayConfig();
  }

  setOnline(online: boolean): void {
    this.online = online;
    if (online) {
      this.flushOutgoingQueue();
    }
  }

  private async enqueueOutgoingMessage(options: {
    identityId: string;
    contactId: string;
    senderNpub: string;
    recipientNpub: string;
    plaintext: string;
  }): Promise<NostlingMessage> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const status: NostlingMessageStatus = this.online ? 'sending' : 'queued';

    this.database.run(
      'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, event_id, timestamp, status, direction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        options.identityId,
        options.contactId,
        options.senderNpub,
        options.recipientNpub,
        options.plaintext,
        null,
        now,
        status,
        'outgoing',
      ]
    );

    this.bumpContactLastMessage(options.contactId, now);

    if (this.online) {
      this.flushOutgoingQueue();
    }

    return {
      id,
      identityId: options.identityId,
      contactId: options.contactId,
      senderNpub: options.senderNpub,
      recipientNpub: options.recipientNpub,
      ciphertext: options.plaintext,
      timestamp: now,
      status,
      direction: 'outgoing',
    };
  }

  private flushOutgoingQueue(): void {
    const stmt = this.database.prepare(
      "SELECT id FROM nostr_messages WHERE direction = 'outgoing' AND status IN ('queued', 'sending') ORDER BY timestamp ASC"
    );

    const queuedIds: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      queuedIds.push(row.id as string);
    }
    stmt.free();

    for (const id of queuedIds) {
      this.database.run("UPDATE nostr_messages SET status = 'sent', event_id = ? WHERE id = ?", [randomUUID(), id]);
      log('info', `Nostling message ${id} marked as sent (simulated relay publish)`);
    }
  }

  private resolveSecretRef(request: CreateIdentityRequest): Promise<string> {
    if (request.secretRef) {
      return Promise.resolve(request.secretRef);
    }
    if (request.nsec) {
      return this.secretStore.saveSecret(request.nsec);
    }
    throw new Error('secretRef or nsec is required to create an identity');
  }

  private mapIdentityRow(row: IdentityRow): NostlingIdentity {
    return {
      id: row.id,
      npub: row.npub,
      secretRef: row.secret_ref,
      label: row.label,
      relays: row.relays ? JSON.parse(row.relays) : undefined,
      createdAt: this.toIso(row.created_at),
    };
  }

  private mapContactRow(row: ContactRow): NostlingContact {
    return {
      id: row.id,
      identityId: row.identity_id,
      npub: row.npub,
      alias: row.alias,
      state: row.state,
      createdAt: this.toIso(row.created_at),
      lastMessageAt: row.last_message_at ? this.toIso(row.last_message_at) : undefined,
    };
  }

  private mapMessageRow(row: MessageRow): NostlingMessage {
    return {
      id: row.id,
      identityId: row.identity_id,
      contactId: row.contact_id,
      senderNpub: row.sender_npub,
      recipientNpub: row.recipient_npub,
      ciphertext: row.ciphertext,
      eventId: row.event_id || undefined,
      timestamp: this.toIso(row.timestamp),
      status: row.status,
      direction: row.direction,
    };
  }

  private assertIdentityExists(identityId: string): void {
    const stmt = this.database.prepare('SELECT id FROM nostr_identities WHERE id = ? LIMIT 1');
    stmt.bind([identityId]);
    const exists = stmt.step();
    stmt.free();

    if (!exists) {
      throw new Error(`Identity not found: ${identityId}`);
    }
  }

  private getIdentityNpub(identityId: string): string {
    const stmt = this.database.prepare('SELECT npub FROM nostr_identities WHERE id = ? LIMIT 1');
    stmt.bind([identityId]);
    const hasRow = stmt.step();
    const result = hasRow ? (stmt.getAsObject().npub as string) : null;
    stmt.free();

    if (!result) {
      throw new Error(`Identity not found: ${identityId}`);
    }

    return result;
  }

  private getContact(contactId: string): NostlingContact {
    const stmt = this.database.prepare(
      'SELECT id, identity_id, npub, alias, state, created_at, last_message_at FROM nostr_contacts WHERE id = ? LIMIT 1'
    );
    stmt.bind([contactId]);
    const hasRow = stmt.step();
    const result = hasRow ? (stmt.getAsObject() as unknown as ContactRow) : null;
    stmt.free();

    if (!result) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    return this.mapContactRow(result);
  }

  private findContactByNpub(identityId: string, npub: string): NostlingContact | null {
    const stmt = this.database.prepare(
      'SELECT id, identity_id, npub, alias, state, created_at, last_message_at FROM nostr_contacts WHERE identity_id = ? AND npub = ? LIMIT 1'
    );
    stmt.bind([identityId, npub]);
    const hasRow = stmt.step();
    const result = hasRow ? (stmt.getAsObject() as unknown as ContactRow) : null;
    stmt.free();

    return result ? this.mapContactRow(result) : null;
  }

  private bumpContactLastMessage(contactId: string, timestamp: string): void {
    this.database.run('UPDATE nostr_contacts SET last_message_at = ? WHERE id = ?', [timestamp, contactId]);
  }

  private toIso(value: string): string {
    try {
      return new Date(value).toISOString();
    } catch {
      return value;
    }
  }
}
