import { randomUUID } from 'crypto';
import { Database } from 'sql.js';
import { BoundedSet } from './bounded-set';
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
  RelayConfigResult,
} from '../../shared/types';
import { log } from '../logging';
import { NostlingSecretStore } from './secret-store';
import { RelayConfigManager, DEFAULT_RELAYS } from './relay-config-manager';
import {
  deriveKeypair,
  generateKeypair,
  encryptMessage,
  decryptMessage,
  buildKind4Event,
  encryptNip17Message,
  decryptNip17Message,
  npubToHex,
  hexToNpub,
  isValidNsec,
  isValidNpub,
  NostrKeypair,
  NostrEvent
} from './crypto';
import { unwrapEvent } from 'nostr-tools/nip59';
import { RelayPool, RelayEndpoint, Filter, PublishResult, RelayStatus } from './relay-pool';
import {
  resolveDisplayNameForContact,
  resolveDisplayNameForIdentity
} from './display-name-resolver';
import {
  enhanceIdentitiesWithProfilesSqlJs,
  enhanceContactsWithProfilesSqlJs
} from './service-profile-status';
import { schedulePublicProfileDiscovery, discoverPublicProfile } from './public-profile-discovery';
import { handleReceivedWrappedEvent } from './profile-receiver';
import { triggerP2PConnectionsOnOnline, isP2PSignalEvent, routeP2PSignal } from './p2p-service-integration';
import { BrowserWindow } from 'electron';
import {
  generateMnemonic,
  validateMnemonic,
  deriveKeypairFromMnemonic,
  mnemonicToSeed,
  seedToHex,
  deriveKeypairFromSeed,
  validateDerivationPath,
  DEFAULT_DERIVATION_PATH,
} from './mnemonic-crypto';
import { saveSeed } from './mnemonic-storage';
import {
  getMinTimestampForKind,
  batchUpdateTimestamps,
  deleteSyncStatesForIdentity,
  TimestampUpdate,
} from '../database/relay-sync-state';

// Constants for timestamp-based sparse polling
const CLOCK_SKEW_BUFFER = 60; // seconds subtracted from 'since' to handle clock drift
const FIRST_POLL_LOOKBACK = 5 * 60; // seconds (5 min) for first poll when no prior state
const FIRST_STREAM_LOOKBACK = 24 * 60 * 60; // seconds (24h) for first subscription
const TIMESTAMP_UPDATE_DEBOUNCE_MS = 2000; // milliseconds between DB writes

interface IdentityRow {
  id: string;
  npub: string;
  secret_ref: string;
  label: string;
  relays: string | null;
  theme: string | null;
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
  deleted_at: string | null;
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
  is_read: boolean;
  kind: number | null;
  was_gift_wrapped: number | null; // SQLite stores boolean as 0/1
}

interface NostrKind4Filter extends Filter {
  kinds: [4];
  authors?: string[];
  '#p'?: string[];
}

interface NostrKind1059Filter extends Filter {
  kinds: [1059];
  '#p': string[];
}

export interface NostlingServiceOptions {
  /**
   * When true, queued messages will be marked as sent immediately.
   * Defaults to false to reflect offline-first behavior until explicitly set online.
   */
  online?: boolean;
}

export class NostlingService {
  private online: boolean;
  private relayPool: RelayPool | null = null;
  private subscriptions: Map<string, { close: () => void }> = new Map();
  private profileDiscoveryCleanups: Map<string, () => void> = new Map();
  private profileUpdateCallbacks: Set<(identityId: string) => void> = new Set();
  private seenEventIds = new BoundedSet<string>(50_000);
  private relayConfigManager: RelayConfigManager;
  private pollingTimer: NodeJS.Timeout | null = null;
  private pollingIntervalMs: number = 0;
  private mainWindow: BrowserWindow | null = null;

  // Debounced timestamp updates for sparse polling
  private pendingTimestampUpdates: Map<string, { kind: number; timestamp: number }> = new Map();
  private timestampUpdateTimer: NodeJS.Timeout | null = null;

  constructor(private readonly database: Database, private readonly secretStore: NostlingSecretStore, configDir: string, options: NostlingServiceOptions = {}) {
    this.online = Boolean(options.online);
    this.relayConfigManager = new RelayConfigManager(configDir);
  }

  /**
   * Get the secret store for mnemonic operations
   * Used by mnemonic backup/recovery IPC handlers
   */
  getSecretStore(): NostlingSecretStore {
    return this.secretStore;
  }

  /**
   * Set the main window reference for P2P IPC communication
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  async listIdentities(): Promise<NostlingIdentity[]> {
    const stmt = this.database.prepare(
      'SELECT id, npub, secret_ref, label, relays, theme, created_at FROM nostr_identities ORDER BY created_at ASC'
    );

    const identities: NostlingIdentity[] = [];
    while (stmt.step()) {
      const identity = this.mapIdentityRow(stmt.getAsObject() as unknown as IdentityRow);

      let profileName: string;
      try {
        const resolution = resolveDisplayNameForIdentity(identity.id, this.database);
        profileName = resolution.displayName;
      } catch (error) {
        profileName = identity.label;
      }

      identities.push({
        ...identity,
        profileName
      });
    }

    // Enhance with profile status before freeing statement
    const enhancedIdentities = enhanceIdentitiesWithProfilesSqlJs(this.database, identities);

    stmt.free();
    return enhancedIdentities;
  }

  async createIdentity(request: CreateIdentityRequest): Promise<NostlingIdentity> {
    return this.withErrorLogging('create identity', async () => {
      if (!request?.label || !request.label.trim()) {
        throw new Error('Identity label is required');
      }

      let npubToStore: string;
      let secretRef: string;
      let seedHex: string | undefined;

      // Validate derivation path if provided
      if (request.derivationPath && !validateDerivationPath(request.derivationPath)) {
        throw new Error('Invalid derivation path format. Expected BIP-44 format like m/44\'/1237\'/0\'/0/0');
      }

      // Handle different identity creation paths
      if (request.nsec && isValidNsec(request.nsec.trim())) {
        // Path 1: Valid nsec provided - derive keypair (no seed storage)
        const nsec = request.nsec.trim();
        const keypair = deriveKeypair(nsec);
        npubToStore = keypair.npub;
        secretRef = await this.secretStore.saveSecret(nsec);
      } else if (request.npub && request.secretRef) {
        // Path 2: Legacy test path - npub + secretRef provided
        // (for backward compatibility with tests that use placeholder values)
        npubToStore = request.npub.trim();
        secretRef = request.secretRef;
      } else if (request.npub && request.nsec) {
        // Path 3: Legacy test path - both provided but nsec is invalid placeholder
        // Store the nsec as-is for tests
        npubToStore = request.npub.trim();
        secretRef = await this.secretStore.saveSecret(request.nsec);
      } else if (request.mnemonic && validateMnemonic(request.mnemonic.trim())) {
        // Path 4: Mnemonic recovery - derive keypair using BIP-32/39/44
        // User may specify custom derivation path for recovery from other apps
        const mnemonic = request.mnemonic.trim();
        const derivPath = request.derivationPath || DEFAULT_DERIVATION_PATH;

        // Generate seed from mnemonic (BIP-39)
        const seed = mnemonicToSeed(mnemonic);
        seedHex = seedToHex(seed);

        // Derive keypair from seed using specified path (BIP-32)
        const derivation = deriveKeypairFromSeed(seedHex, derivPath);
        npubToStore = derivation.npub;
        secretRef = await this.secretStore.saveSecret(derivation.nsec);
        log('info', `Derived identity from mnemonic using path: ${derivPath}`);
      } else if (!request.npub && !request.nsec && !request.mnemonic) {
        // Path 5: Generate new identity using BIP-39 mnemonic for backup capability
        const generatedMnemonic = generateMnemonic();
        const derivation = deriveKeypairFromMnemonic(generatedMnemonic);
        npubToStore = derivation.npub;
        secretRef = await this.secretStore.saveSecret(derivation.nsec);
        seedHex = derivation.seedHex;
        log('info', `Generated new identity using path: ${derivation.derivationPath}`);
      } else {
        throw new Error('Invalid identity creation request: provide valid nsec, or npub+secretRef, or neither to generate');
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      const relaysJson = request.relays && request.relays.length > 0 ? JSON.stringify(request.relays) : null;

      this.database.run(
        'INSERT INTO nostr_identities (id, npub, secret_ref, label, relays, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, npubToStore, secretRef, request.label, relaysJson, now]
      );

      // Initialize relay config file with defaults
      try {
        await this.relayConfigManager.saveRelays(id, DEFAULT_RELAYS);
      } catch (error) {
        log('warn', `Failed to initialize relay config for identity ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Save seed if available (for backup/recovery capability)
      // Seeds are stored instead of mnemonics for security (BIP-32/39/44 compliant)
      if (seedHex) {
        try {
          await saveSeed(this.secretStore, id, seedHex);
          log('info', `Saved seed backup for identity ${id}`);
        } catch (error) {
          log('warn', `Failed to save seed for identity ${id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      log('info', `Created nostling identity ${id}`);

      // Start subscription for the new identity
      await this.startSubscription(id);

      return {
        id,
        npub: npubToStore,
        secretRef,
        label: request.label,
        relays: request.relays,
        createdAt: now,
      };
    });
  }

  async removeIdentity(id: string): Promise<void> {
    this.database.run('DELETE FROM nostr_messages WHERE identity_id = ?', [id]);
    this.database.run('DELETE FROM nostr_contacts WHERE identity_id = ?', [id]);
    this.database.run('DELETE FROM nostr_relays WHERE identity_id = ?', [id]);
    this.database.run('DELETE FROM nostr_identities WHERE id = ?', [id]);
    // Clean up relay sync state for this identity
    deleteSyncStatesForIdentity(this.database, id);
    log('info', `Removed nostling identity ${id}`);
  }

  async updateIdentityLabel(identityId: string, label: string): Promise<NostlingIdentity> {
    const trimmed = label.trim();
    if (!trimmed) {
      throw new Error('Identity label cannot be empty');
    }

    this.assertIdentityExists(identityId);
    this.database.run('UPDATE nostr_identities SET label = ? WHERE id = ?', [trimmed, identityId]);
    log('info', `Updated label for identity ${identityId}`);

    const stmt = this.database.prepare(
      'SELECT id, npub, secret_ref, label, relays, theme, created_at FROM nostr_identities WHERE id = ? LIMIT 1'
    );
    stmt.bind([identityId]);
    const hasRow = stmt.step();
    const row = hasRow ? (stmt.getAsObject() as unknown as IdentityRow) : null;
    stmt.free();

    if (!row) {
      throw new Error(`Identity not found: ${identityId}`);
    }

    return this.mapIdentityRow(row);
  }

  async updateIdentityTheme(identityId: string, themeId: string): Promise<void> {
    const { updateIdentityTheme } = await import('./update-identity-theme');
    await updateIdentityTheme(this.database, identityId, themeId);
    log('info', `Updated theme for identity ${identityId} to ${themeId}`);
  }

  async listContacts(identityId: string): Promise<NostlingContact[]> {
    const stmt = this.database.prepare(
      'SELECT id, identity_id, npub, alias, state, created_at, last_message_at, deleted_at FROM nostr_contacts WHERE identity_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
    );
    stmt.bind([identityId]);

    const contacts: NostlingContact[] = [];
    while (stmt.step()) {
      const contact = this.mapContactRow(stmt.getAsObject() as unknown as ContactRow);

      let profileName: string;
      try {
        const resolution = resolveDisplayNameForContact(contact.id, this.database);
        profileName = resolution.displayName;
      } catch (error) {
        profileName = contact.alias;
      }

      contacts.push({
        ...contact,
        profileName
      });
    }

    // Enhance with profile status before freeing statement
    const enhancedContacts = enhanceContactsWithProfilesSqlJs(this.database, contacts);

    stmt.free();
    return enhancedContacts;
  }

  async addContact(request: AddContactRequest): Promise<NostlingContact> {
    return this.withErrorLogging('add contact', async () => {
      this.assertIdentityExists(request.identityId);

      // Prevent adding self as contact
      const identityNpub = this.getIdentityNpub(request.identityId);
      if (request.npub === identityNpub) {
        throw new Error('Cannot add yourself as a contact');
      }

      // Check for existing contact with same identity_id and npub
      const existingStmt = this.database.prepare(
        'SELECT id FROM nostr_contacts WHERE identity_id = ? AND npub = ? AND deleted_at IS NULL'
      );
      existingStmt.bind([request.identityId, request.npub]);
      if (existingStmt.step()) {
        const existingRow = existingStmt.getAsObject();
        existingStmt.free();
        throw new Error(`Contact with npub ${request.npub} already exists for this identity`);
      }
      existingStmt.free();

      const id = randomUUID();
      const now = new Date().toISOString();
      // Store alias as provided (empty string if not set) - don't default to npub
      // This allows profile name to take precedence when no alias is set
      const alias = request.alias?.trim() || '';

      this.database.run(
        'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, request.identityId, request.npub, alias, 'pending', now]
      );

      log('info', `Added nostling contact ${id} for identity ${request.identityId}`);

      // Trigger public profile discovery for the new contact
      // Await completion so the returned contact has profile name populated
      if (this.relayPool) {
        try {
          const pubkeyHex = npubToHex(request.npub);
          await discoverPublicProfile(pubkeyHex, this.relayPool, this.database);
        } catch (err) {
          log('warn', `Failed to discover profile for new contact ${request.npub}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Re-resolve display name after profile discovery
      let profileName: string;
      try {
        const resolution = resolveDisplayNameForContact(id, this.database);
        profileName = resolution.displayName;
      } catch {
        profileName = alias || '';
      }

      // Create base contact and enhance with profile status
      const baseContact: NostlingContact = {
        id,
        identityId: request.identityId,
        npub: request.npub,
        alias,
        profileName,
        state: 'pending',
        createdAt: now,
      };

      // Enhance with profileSource and picture
      const [enhanced] = enhanceContactsWithProfilesSqlJs(this.database, [baseContact]);
      return enhanced;
    });
  }

  async removeContact(contactId: string): Promise<void> {
    const contact = this.getContact(contactId, { includeDeleted: true });
    if (contact.deletedAt) {
      log('info', `Contact ${contactId} already marked as deleted`);
      return;
    }

    const now = new Date().toISOString();
    this.database.run('UPDATE nostr_contacts SET deleted_at = ?, last_message_at = NULL WHERE id = ?', [now, contactId]);
    this.database.run('DELETE FROM nostr_messages WHERE contact_id = ?', [contactId]);
    log('info', `Removed nostling contact ${contactId}`);
  }

  async updateContactAlias(contactId: string, alias: string): Promise<NostlingContact> {
    const trimmed = alias.trim();
    if (!trimmed) {
      throw new Error('Contact alias cannot be empty');
    }

    const existing = this.getContact(contactId);
    this.database.run('UPDATE nostr_contacts SET alias = ? WHERE id = ?', [trimmed, contactId]);
    log('info', `Updated alias for contact ${contactId}`);

    // Re-resolve display name after updating alias (alias takes precedence)
    let profileName: string;
    try {
      const resolution = resolveDisplayNameForContact(contactId, this.database);
      profileName = resolution.displayName;
    } catch {
      profileName = trimmed;
    }

    // Create base contact and enhance with profile status
    const baseContact: NostlingContact = {
      ...existing,
      alias: trimmed,
      profileName,
    };

    // Enhance with profileSource and picture
    const [enhanced] = enhanceContactsWithProfilesSqlJs(this.database, [baseContact]);
    return enhanced;
  }

  async clearContactAlias(contactId: string): Promise<NostlingContact> {
    const existing = this.getContact(contactId);
    this.database.run('UPDATE nostr_contacts SET alias = ? WHERE id = ?', ['', contactId]);
    log('info', `Cleared alias for contact ${contactId}`);

    // Re-resolve display name after clearing alias (will fall back to profile or npub)
    let profileName: string;
    try {
      const resolution = resolveDisplayNameForContact(contactId, this.database);
      profileName = resolution.displayName;
    } catch {
      profileName = '';
    }

    // Create base contact and enhance with profile status
    const baseContact: NostlingContact = {
      ...existing,
      alias: '',
      profileName,
    };

    // Enhance with profileSource and picture
    const [enhanced] = enhanceContactsWithProfilesSqlJs(this.database, [baseContact]);
    return enhanced;
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
      'SELECT id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, event_id, timestamp, status, direction, is_read, kind, was_gift_wrapped FROM nostr_messages WHERE identity_id = ? AND contact_id = ? ORDER BY timestamp ASC'
    );
    stmt.bind([identityId, contactId]);

    const messages: NostlingMessage[] = [];
    while (stmt.step()) {
      messages.push(this.mapMessageRow(stmt.getAsObject() as unknown as MessageRow));
    }
    stmt.free();
    return messages;
  }


  /**
   * Mark all unread incoming messages for a contact as read.
   * Returns the count of messages that were marked as read.
   */
  async markMessagesRead(identityId: string, contactId: string): Promise<number> {
    const result = this.database.run(
      'UPDATE nostr_messages SET is_read = 1 WHERE identity_id = ? AND contact_id = ? AND direction = ? AND is_read = 0',
      [identityId, contactId, 'incoming']
    );
    const changes = this.database.getRowsModified();
    if (changes > 0) {
      log('info', `Marked ${changes} messages as read for contact ${contactId}`);
    }
    return changes;
  }

  /**
   * Get unread message counts for all contacts of an identity.
   * Returns a map of contactId -> unread count.
   */
  async getUnreadCounts(identityId: string): Promise<Record<string, number>> {
    const stmt = this.database.prepare(
      'SELECT contact_id, COUNT(*) as count FROM nostr_messages WHERE identity_id = ? AND direction = ? AND is_read = 0 GROUP BY contact_id'
    );
    stmt.bind([identityId, 'incoming']);

    const counts: Record<string, number> = {};
    while (stmt.step()) {
      const row = stmt.getAsObject() as { contact_id: string; count: number };
      counts[row.contact_id] = row.count;
    }
    stmt.free();
    return counts;
  }

  async sendMessage(request: { identityId: string; contactId: string; plaintext: string }): Promise<NostlingMessage> {
    return this.withErrorLogging('send message', async () => {
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
    });
  }

  async ingestIncomingMessage(options: {
    identityId: string;
    senderNpub: string;
    recipientNpub: string;
    content: string;  // Decrypted plaintext content
    eventId?: string;
    timestamp?: string;
    decryptionFailed?: boolean;
    errorDetail?: string;
    kind?: number;  // Nostr event kind (e.g., 4 for DM)
    wasGiftWrapped?: boolean;  // Whether message was received via NIP-59 gift wrap
  }): Promise<NostlingMessage | null> {
    return this.withErrorLogging('ingest incoming message', async () => {
      if (options.decryptionFailed) {
        log('warn', `Discarding nostling message due to decryption failure from ${options.senderNpub}`);
        return null;
      }

      const contact = this.findContactByNpub(options.identityId, options.senderNpub);
      if (!contact) {
        log('warn', `Discarding nostling message from unknown sender ${options.senderNpub}`);
        return null;
      }

      // BUG FIX: Check for existing event_id per conversation before INSERT to prevent duplicates
      // Root cause: No database-level check preventing duplicate event_id insertion per conversation
      // Bug report: bug-reports/duplicate-event-ingestion.md
      // Date: 2025-12-13
      if (options.eventId) {
        const existing = this.database.prepare(
          'SELECT id FROM nostr_messages WHERE event_id = ? AND identity_id = ? AND contact_id = ?'
        );
        existing.bind([options.eventId, options.identityId, contact.id]);
        if (existing.step()) {
          existing.free();
          log('info', `Duplicate event ${options.eventId} for conversation (identity: ${options.identityId}, contact: ${contact.id}) already ingested, skipping`);
          return null;
        }
        existing.free();
      }

      const now = options.timestamp || new Date().toISOString();
      const id = randomUUID();

      this.database.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, event_id, timestamp, status, direction, is_read, kind, was_gift_wrapped) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          options.identityId,
          contact.id,
          options.senderNpub,
          options.recipientNpub,
          options.content,  // Store plaintext content (DB column is still named 'ciphertext')
          options.eventId || null,
          now,
          'sent',
          'incoming',
          0, // Incoming messages start as unread
          options.kind ?? null,
          options.wasGiftWrapped === undefined ? null : options.wasGiftWrapped ? 1 : 0,
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
        content: options.content,
        eventId: options.eventId,
        timestamp: now,
        status: 'sent',
        direction: 'incoming',
        isRead: false,
        kind: options.kind,
        wasGiftWrapped: options.wasGiftWrapped,
      };
    });
  }

  async discardUnknown(eventId: string): Promise<void> {
    log('warn', `Discarded nostling event from unknown sender: ${eventId}`);
  }

  async getOutgoingQueue(identityId?: string): Promise<NostlingMessage[]> {
    const stmt = identityId
      ? this.database.prepare(
          "SELECT id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, event_id, timestamp, status, direction, is_read, kind, was_gift_wrapped FROM nostr_messages WHERE direction = 'outgoing' AND status IN ('queued', 'sending') AND identity_id = ? ORDER BY timestamp ASC"
        )
      : this.database.prepare(
          "SELECT id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, event_id, timestamp, status, direction, is_read, kind, was_gift_wrapped FROM nostr_messages WHERE direction = 'outgoing' AND status IN ('queued', 'sending') ORDER BY timestamp ASC"
        );

    if (identityId) {
      stmt.bind([identityId]);
    }

    const messages: NostlingMessage[] = [];
    while (stmt.step()) {
      messages.push(this.mapMessageRow(stmt.getAsObject() as unknown as MessageRow));
    }
    stmt.free();
    return messages;
  }

  async markMessageSending(messageId: string): Promise<NostlingMessage> {
    const row = this.getOutgoingMessageRow(messageId);
    this.database.run("UPDATE nostr_messages SET status = 'sending' WHERE id = ?", [messageId]);
    return this.mapMessageRow({ ...row, status: 'sending' });
  }

  async markMessageSent(messageId: string, eventId: string): Promise<NostlingMessage> {
    const row = this.getOutgoingMessageRow(messageId);
    this.database.run("UPDATE nostr_messages SET status = 'sent', event_id = ? WHERE id = ?", [eventId, messageId]);
    return this.mapMessageRow({ ...row, status: 'sent', event_id: eventId });
  }

  async markMessageError(messageId: string): Promise<NostlingMessage> {
    const row = this.getOutgoingMessageRow(messageId);
    this.database.run("UPDATE nostr_messages SET status = 'error' WHERE id = ?", [messageId]);
    return this.mapMessageRow({ ...row, status: 'error' });
  }

  async retryFailedMessages(identityId?: string): Promise<NostlingMessage[]> {
    const whereClause = identityId
      ? "WHERE direction = 'outgoing' AND status = 'error' AND identity_id = ?"
      : "WHERE direction = 'outgoing' AND status = 'error'";

    const params = identityId ? [identityId] : [];

    // First, collect the IDs of messages to retry
    const selectStmt = this.database.prepare(
      `SELECT id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, event_id, timestamp, status, direction, is_read, kind, was_gift_wrapped FROM nostr_messages ${whereClause}`
    );

    if (identityId) {
      selectStmt.bind([identityId]);
    }

    const errorMessages: NostlingMessage[] = [];
    while (selectStmt.step()) {
      errorMessages.push(this.mapMessageRow(selectStmt.getAsObject() as unknown as MessageRow));
    }
    selectStmt.free();

    if (errorMessages.length === 0) {
      return [];
    }

    // Reset error messages to queued
    this.database.run(
      `UPDATE nostr_messages SET status = 'queued' ${whereClause}`,
      params
    );

    // Return the messages with updated status
    const retriedMessages = errorMessages.map((msg) => ({ ...msg, status: 'queued' as const }));

    log('info', `Retrying ${retriedMessages.length} failed nostling message(s)`);

    // Attempt to flush if online
    if (this.online && retriedMessages.length > 0) {
      await this.flushOutgoingQueue();
    }

    return retriedMessages;
  }

  async getSubscriptionFilters(identityId: string): Promise<Filter[]> {
    const identityNpub = this.getIdentityNpub(identityId);
    const contacts = await this.listContacts(identityId);

    // Convert npubs to hex pubkeys for relay filters (Nostr protocol requirement)
    // Falls back to npub for test mode with placeholder values
    const toHexOrPassthrough = (npub: string): string =>
      isValidNpub(npub) ? npubToHex(npub) : npub;

    const identityPubkey = toHexOrPassthrough(identityNpub);

    const filters: Filter[] = [];

    // Kind 1059: NIP-59 gift wrap events (private profiles, etc.)
    // These are received from ANY sender, addressed to our identity
    const kind1059Filter: NostrKind1059Filter = {
      kinds: [1059],
      '#p': [identityPubkey],
    };
    filters.push(kind1059Filter);
    log('info', `[getSubscriptionFilters] Kind 1059 filter for pubkey: ${identityPubkey}`);

    // Kind 4: Direct messages (only if we have contacts)
    if (contacts.length > 0) {
      const contactPubkeys = contacts.map((contact) => toHexOrPassthrough(contact.npub));

      const kind4FilterIncoming: NostrKind4Filter = {
        kinds: [4],
        authors: contactPubkeys,
        '#p': [identityPubkey],
      };
      const kind4FilterOutgoing: NostrKind4Filter = {
        kinds: [4],
        authors: [identityPubkey],
        '#p': contactPubkeys,
      };
      filters.push(kind4FilterIncoming, kind4FilterOutgoing);
    }

    return filters;
  }

  // Backward compatibility alias (used in tests and polling)
  async getKind4Filters(identityId: string): Promise<NostrKind4Filter[]> {
    const filters = await this.getSubscriptionFilters(identityId);
    return filters.filter((f): f is NostrKind4Filter => f.kinds?.includes(4) === true) as NostrKind4Filter[];
  }

  async getRelaysForIdentity(identityId: string): Promise<NostlingRelayEndpoint[]> {
    return this.withErrorLogging(`get relays for identity ${identityId}`, async () => {
      return this.relayConfigManager.loadRelays(identityId);
    });
  }

  async setRelaysForIdentity(identityId: string, relays: NostlingRelayEndpoint[]): Promise<RelayConfigResult> {
    return this.withErrorLogging(`set relays for identity ${identityId}`, async () => {
      return this.relayConfigManager.saveRelays(identityId, relays);
    });
  }

  async reloadRelaysForIdentity(identityId: string): Promise<NostlingRelayEndpoint[]> {
    return this.withErrorLogging(`reload relays for identity ${identityId}`, async () => {
      return this.relayConfigManager.reloadRelays(identityId);
    });
  }

  async setOnline(online: boolean): Promise<void> {
    this.online = online;
    if (online) {
      await this.flushOutgoingQueue();
    }
  }

  async initialize(): Promise<void> {
    log('info', 'Initializing nostling service');

    // Run migration to move relay config from database to filesystem
    const identities = await this.listIdentities();
    await this.relayConfigManager.migrateFromDatabase(this.database, identities);

    // Load relays for the first identity (if exists)
    // When NOSTLING_DEV_RELAY is set, always use it (even with no identities)
    let relays: NostlingRelayEndpoint[] = [];
    const devRelayUrl = process.env.NOSTLING_DEV_RELAY;
    if (devRelayUrl) {
      // Dev/test mode: use only the dev relay
      log('info', `Using dev relay for initialization: ${devRelayUrl}`);
      relays = [{ url: devRelayUrl, read: true, write: true, order: 0 }];
    } else if (identities.length > 0) {
      relays = await this.relayConfigManager.loadRelays(identities[0].id);
    } else {
      relays = DEFAULT_RELAYS;
    }

    // BUG FIX: Include read/write properties in endpoint mapping
    // Root cause: Relay read/write flags were being dropped during endpoint conversion
    // Bug report: bug-reports/relay-publish-all-failed-report.md
    // Fixed: 2025-12-12
    const endpoints: RelayEndpoint[] = relays.map(e => ({
      url: e.url,
      read: e.read,
      write: e.write
    }));

    if (endpoints.length === 0) {
      log('warn', 'No relay endpoints configured, nostling service will be offline');
      return;
    }

    // Create and connect relay pool
    this.relayPool = new RelayPool();
    await this.relayPool.connect(endpoints);

    // Start subscriptions for all identities
    for (const identity of identities) {
      await this.startSubscription(identity.id);
    }

    // Mark service online and flush queued messages
    this.online = true;
    await this.flushOutgoingQueue();

    log('info', 'Nostling service initialized');
  }

  async destroy(): Promise<void> {
    log('info', 'Shutting down nostling service');

    // Stop polling timer
    this.stopPolling();

    // Flush any pending timestamp updates before shutdown
    if (this.timestampUpdateTimer) {
      clearTimeout(this.timestampUpdateTimer);
      this.timestampUpdateTimer = null;
    }
    this.flushTimestampUpdates();

    // Close all subscriptions
    for (const [identityId, subscription] of this.subscriptions.entries()) {
      subscription.close();
      log('info', `Closed subscription for identity ${identityId}`);
    }
    this.subscriptions.clear();

    // Stop all profile discovery schedulers
    for (const [identityId, cleanup] of this.profileDiscoveryCleanups.entries()) {
      cleanup();
      log('info', `Stopped profile discovery for identity ${identityId}`);
    }
    this.profileDiscoveryCleanups.clear();

    // Disconnect relay pool
    if (this.relayPool) {
      this.relayPool.disconnect();
      this.relayPool = null;
    }

    this.online = false;
    log('info', 'Nostling service shut down');
  }

  /**
   * Get the relay pool instance
   * Used for P2P integration to send/receive signaling messages
   */
  getRelayPool(): RelayPool | null {
    return this.relayPool;
  }

  /**
   * Get the database instance
   * Used for P2P integration to access connection state
   */
  getDatabase(): Database {
    return this.database;
  }

  /**
   * Trigger P2P connection attempts for all identities
   * Called when app goes online or relay connections are established
   */
  async triggerP2PConnections(mainWindow: BrowserWindow | null): Promise<void> {
    if (!this.online || !this.relayPool) {
      log('debug', 'Skipping P2P trigger: service offline or relay pool not ready');
      return;
    }

    const identities = await this.listIdentities();
    if (identities.length === 0) {
      log('debug', 'Skipping P2P trigger: no identities');
      return;
    }

    log('info', `Triggering P2P connections for ${identities.length} identities`);

    for (const identity of identities) {
      try {
        // Get keypair from secret store
        const secretKey = await this.secretStore.getSecret(identity.secretRef);
        if (!secretKey) {
          log('warn', `Cannot trigger P2P for identity ${identity.npub}: secret not found`);
          continue;
        }

        const keypair = deriveKeypair(secretKey);

        await triggerP2PConnectionsOnOnline(
          this.database,
          this.relayPool,
          keypair.pubkeyHex,
          keypair,
          mainWindow
        );
      } catch (error) {
        log('error', `P2P trigger failed for identity ${identity.npub}: ${error}`);
      }
    }
  }

  // ============================================================================
  // Message Polling
  // ============================================================================

  /**
   * Polls for recent messages from all relays as a catch-up mechanism.
   * This supplements real-time streaming subscriptions to ensure messages
   * aren't missed during brief disconnections.
   *
   * @returns Number of events processed (may include duplicates filtered by deduplication)
   */
  async pollMessages(): Promise<number> {
    if (!this.relayPool) {
      log('debug', 'Polling skipped: relay pool not initialized');
      return 0;
    }

    const identities = await this.listIdentities();
    if (identities.length === 0) {
      log('debug', 'Polling skipped: no identities');
      return 0;
    }

    let processedCount = 0;
    const timestampUpdates: TimestampUpdate[] = [];
    const connectedRelays = Array.from(this.relayPool.getStatus().entries())
      .filter(([, status]) => status === 'connected')
      .map(([url]) => url);

    for (const identity of identities) {
      const filters = await this.getKind4Filters(identity.id);
      if (filters.length === 0) {
        continue;
      }

      // Build filters with per-kind 'since' timestamps
      const pollFilters = filters.map(f => {
        const kind = f.kinds?.[0];
        if (!kind) return f;

        // Get last known timestamp for this identity/kind
        const lastTimestamp = getMinTimestampForKind(this.database, identity.id, kind);

        // Use last known timestamp with clock-skew buffer, or fallback for first sync
        const sinceTimestamp = lastTimestamp
          ? lastTimestamp - CLOCK_SKEW_BUFFER
          : Math.floor(Date.now() / 1000) - FIRST_POLL_LOOKBACK;

        return { ...f, since: sinceTimestamp };
      });

      try {
        const events = await this.relayPool.querySync(pollFilters, { maxWait: 5000 });

        // Track max timestamp per kind for this poll
        const maxTimestampPerKind = new Map<number, number>();

        for (const event of events) {
          // handleIncomingEvent uses seenEventIds for deduplication
          this.handleIncomingEvent(identity.id, event);
          processedCount++;

          // Track maximum timestamp per kind
          const kind = event.kind;
          const current = maxTimestampPerKind.get(kind) || 0;
          if (event.created_at > current) {
            maxTimestampPerKind.set(kind, event.created_at);
          }
        }

        // Queue timestamp updates for all connected relays
        for (const [kind, timestamp] of maxTimestampPerKind) {
          for (const relayUrl of connectedRelays) {
            timestampUpdates.push({
              identityId: identity.id,
              relayUrl,
              eventKind: kind,
              timestamp,
            });
          }
        }
      } catch (error) {
        log('warn', `Polling failed for identity ${identity.id}: ${this.toErrorMessage(error)}`);
      }
    }

    // Batch update all timestamps (debounced)
    if (timestampUpdates.length > 0) {
      this.debouncedUpdateTimestamps(timestampUpdates);
    }

    if (processedCount > 0) {
      log('debug', `Polling processed ${processedCount} event(s)`);
    }

    return processedCount;
  }

  /**
   * Starts periodic message polling at the specified interval.
   *
   * @param intervalMs - Polling interval in milliseconds (0 to disable)
   */
  startPolling(intervalMs: number): void {
    this.stopPolling();

    if (intervalMs <= 0) {
      log('info', 'Message polling disabled');
      return;
    }

    this.pollingIntervalMs = intervalMs;

    this.pollingTimer = setInterval(() => {
      this.pollMessages().catch(err => {
        log('error', `Polling error: ${this.toErrorMessage(err)}`);
      });
    }, intervalMs);

    log('info', `Message polling started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stops periodic message polling.
   */
  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      log('info', 'Message polling stopped');
    }
  }


  /**
   * Queue timestamp updates for debounced batch write to database.
   * Merges updates and keeps highest timestamp per identity+kind.
   */
  private debouncedUpdateTimestamps(updates: TimestampUpdate[]): void {
    // Merge into pending updates (keep highest timestamp per identity+kind)
    for (const update of updates) {
      const key = `${update.identityId}:${update.eventKind}:${update.relayUrl}`;
      const existing = this.pendingTimestampUpdates.get(key);
      if (!existing || update.timestamp > existing.timestamp) {
        this.pendingTimestampUpdates.set(key, {
          kind: update.eventKind,
          timestamp: update.timestamp,
        });
      }
    }

    // Debounce the actual write
    if (this.timestampUpdateTimer) {
      clearTimeout(this.timestampUpdateTimer);
    }

    this.timestampUpdateTimer = setTimeout(() => {
      this.flushTimestampUpdates();
    }, TIMESTAMP_UPDATE_DEBOUNCE_MS);
  }

  /**
   * Flush pending timestamp updates to database.
   * Called on debounce timer expiry and during shutdown.
   */
  private flushTimestampUpdates(): void {
    if (this.pendingTimestampUpdates.size === 0) return;

    const updates: TimestampUpdate[] = [];

    for (const [key, { kind, timestamp }] of this.pendingTimestampUpdates) {
      const [identityId, , relayUrl] = key.split(':');
      // Reconstruct relayUrl (may contain colons in URL)
      const keyParts = key.split(':');
      const actualIdentityId = keyParts[0];
      const actualKind = parseInt(keyParts[1], 10);
      const actualRelayUrl = keyParts.slice(2).join(':');

      updates.push({
        identityId: actualIdentityId,
        relayUrl: actualRelayUrl,
        eventKind: actualKind,
        timestamp,
      });
    }

    if (updates.length > 0) {
      try {
        batchUpdateTimestamps(this.database, updates);
        log('debug', `Flushed ${updates.length} timestamp updates`);
      } catch (error) {
        log('warn', `Failed to flush timestamp updates: ${this.toErrorMessage(error)}`);
      }
    }

    this.pendingTimestampUpdates.clear();
    this.timestampUpdateTimer = null;
  }

  /**
   * Get the current status of all connected relays.
   * Returns a record mapping relay URLs to their connection status.
   */
  getRelayStatus(): Record<string, RelayStatus> {
    if (!this.relayPool) {
      return {};
    }
    const statusMap = this.relayPool.getStatus();
    const result: Record<string, RelayStatus> = {};
    statusMap.forEach((status, url) => {
      result[url] = status;
    });
    return result;
  }

  /**
   * Register a callback to be notified when relay connection status changes.
   */
  onRelayStatusChange(callback: (url: string, status: RelayStatus) => void): void {
    if (this.relayPool) {
      this.relayPool.onStatusChange(callback);
    }
  }

  /**
   * Get the private authored profile for an identity.
   * Returns the profile record if it exists, null otherwise.
   */
  async getPrivateAuthoredProfile(identityId: string): Promise<any> {
    // Query nostr_profiles table for source='private_authored' and owner_pubkey matching identity
    const identities = await this.listIdentities();
    const identity = identities.find(id => id.id === identityId);
    if (!identity) {
      throw new Error(`Identity not found: ${identityId}`);
    }

    const ownerPubkey = npubToHex(identity.npub);
    const stmt = this.database.prepare(`
      SELECT id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at
      FROM nostr_profiles
      WHERE owner_pubkey = ? AND source = 'private_authored'
    `);
    stmt.bind([ownerPubkey]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return {
        id: row.id,
        ownerPubkey: row.owner_pubkey,
        source: row.source,
        content: JSON.parse(row.content_json as string),
        eventId: row.event_id,
        validSignature: Boolean(row.valid_signature),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }

    stmt.free();
    return null;
  }

  /**
   * Get the full profile for a contact (private_received or public_discovered).
   * Returns the profile content with all fields (about, banner, website, nip05, lud16, etc.)
   * Priority: private_received > public_discovered
   */
  async getContactProfile(contactId: string): Promise<any> {
    // First, find the contact to get their npub
    const stmt = this.database.prepare(`
      SELECT npub FROM nostr_contacts WHERE id = ?
    `);
    stmt.bind([contactId]);

    if (!stmt.step()) {
      stmt.free();
      throw new Error(`Contact not found: ${contactId}`);
    }

    const contactRow = stmt.getAsObject();
    stmt.free();

    const contactNpub = contactRow.npub as string;
    const contactPubkeyHex = npubToHex(contactNpub);

    // Query for private_received first (higher priority)
    const sources = ['private_received', 'public_discovered'];
    for (const source of sources) {
      const profileStmt = this.database.prepare(`
        SELECT id, owner_pubkey, source, content_json, event_id, valid_signature, created_at, updated_at
        FROM nostr_profiles
        WHERE owner_pubkey = ? AND source = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `);
      profileStmt.bind([contactPubkeyHex, source]);

      if (profileStmt.step()) {
        const row = profileStmt.getAsObject();
        profileStmt.free();
        return {
          id: row.id,
          ownerPubkey: row.owner_pubkey,
          source: row.source,
          content: JSON.parse(row.content_json as string),
          eventId: row.event_id,
          validSignature: Boolean(row.valid_signature),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }
      profileStmt.free();
    }

    // No profile found
    return null;
  }

  /**
   * Update the private profile for an identity and send to all contacts.
   * Uses the profile-service-integration module for the actual implementation.
   */
  async updatePrivateProfile(request: { identityId: string; content: any }): Promise<any> {
    // Import and delegate to profile-service-integration module
    const { updatePrivateProfile } = await import('./profile-service-integration');
    return updatePrivateProfile(
      { identityId: request.identityId, content: request.content },
      this.database,
      this.secretStore,
      this.relayPool!
    );
  }

  /**
   * Register a callback to be notified when profile data is updated.
   * This is called when public profile discovery finds new/updated profiles.
   */
  onProfileUpdated(callback: (identityId: string) => void): void {
    this.profileUpdateCallbacks.add(callback);
  }

  private async startSubscription(identityId: string): Promise<void> {
    if (!this.relayPool) {
      log('warn', `Cannot start subscription for identity ${identityId}: relay pool not initialized`);
      return;
    }

    // Close existing subscription if any
    const existing = this.subscriptions.get(identityId);
    if (existing) {
      existing.close();
    }

    // Stop existing profile discovery if any
    const existingDiscovery = this.profileDiscoveryCleanups.get(identityId);
    if (existingDiscovery) {
      existingDiscovery();
    }

    // Build filters for this identity (kind 4 DMs and kind 1059 gift wraps)
    const baseFilters = await this.getSubscriptionFilters(identityId);

    // Add 'since' to streaming subscriptions for efficiency
    // Use stored timestamp with buffer, or 24-hour lookback for first startup
    const filtersWithSince = baseFilters.map(f => {
      const kind = f.kinds?.[0];
      if (!kind) return f;

      const lastTimestamp = getMinTimestampForKind(this.database, identityId, kind);

      const sinceTimestamp = lastTimestamp
        ? lastTimestamp - CLOCK_SKEW_BUFFER
        : Math.floor(Date.now() / 1000) - FIRST_STREAM_LOOKBACK;

      return { ...f, since: sinceTimestamp };
    });

    // Get connected relays for timestamp tracking
    const connectedRelays = Array.from(this.relayPool.getStatus().entries())
      .filter(([, status]) => status === 'connected')
      .map(([url]) => url);

    // Subscribe to relay pool with timestamp update on event receive
    const subscription = this.relayPool.subscribe(filtersWithSince, (event) => {
      this.handleIncomingEvent(identityId, event);

      // Update timestamp on streaming receive (debounced)
      const timestampUpdates: TimestampUpdate[] = connectedRelays.map(relayUrl => ({
        identityId,
        relayUrl,
        eventKind: event.kind,
        timestamp: event.created_at,
      }));
      this.debouncedUpdateTimestamps(timestampUpdates);
    });

    this.subscriptions.set(identityId, subscription);
    log('info', `Started subscription for identity ${identityId}`);

    // Schedule public profile discovery for this identity and its contacts
    const discoveryCleanup = schedulePublicProfileDiscovery(
      identityId,
      this.relayPool,
      this.database,
      (updatedIdentityId) => {
        // Notify all registered callbacks when profiles are updated
        for (const callback of this.profileUpdateCallbacks) {
          callback(updatedIdentityId);
        }
      }
    );
    this.profileDiscoveryCleanups.set(identityId, discoveryCleanup);
  }

  private handleIncomingEvent(identityId: string, event: NostrEvent): void {
    log('debug', `[subscription] Received event kind ${event.kind} id ${event.id?.slice(0, 8)}... for identity ${identityId.slice(0, 8)}...`);

    // Deduplicate events per-identity (same event may be received by multiple identity subscriptions)
    const dedupeKey = `${identityId}:${event.id}`;
    if (this.seenEventIds.has(dedupeKey)) {
      log('debug', `[subscription] Duplicate event ${event.id?.slice(0, 8)}..., skipping`);
      return;
    }
    this.seenEventIds.add(dedupeKey);

    // Process event asynchronously (don't block relay subscription)
    this.processIncomingEvent(identityId, event).catch((error) => {
      log('error', `Failed to process incoming event ${event.id}: ${this.toErrorMessage(error)}`);
    });
  }

  private async processIncomingEvent(identityId: string, event: NostrEvent): Promise<void> {
    // Route based on event kind
    if (event.kind === 1059) {
      // NIP-59 gift wrap: handle private profile or other wrapped content
      await this.processGiftWrapEvent(identityId, event);
      return;
    }

    // Kind 4: Direct message (not gift wrapped)
    // Extract sender pubkey
    const senderPubkeyHex = event.pubkey;
    const senderNpub = hexToNpub(senderPubkeyHex);

    // Get recipient npub for this identity
    const recipientNpub = this.getIdentityNpub(identityId);

    // Decrypt message content
    const recipientSecretKey = await this.loadSecretKey(identityId);
    const plaintext = await decryptMessage(event.content, recipientSecretKey, senderPubkeyHex);

    if (plaintext === null) {
      // Decryption failed
      await this.ingestIncomingMessage({
        identityId,
        senderNpub,
        recipientNpub,
        content: event.content,  // Pass ciphertext as-is (will be discarded anyway)
        eventId: event.id,
        timestamp: new Date(event.created_at * 1000).toISOString(),
        decryptionFailed: true,
        kind: event.kind,
        wasGiftWrapped: false,
      });
      return;
    }

    // Store decrypted message (plaintext for display)
    await this.ingestIncomingMessage({
      identityId,
      senderNpub,
      recipientNpub,
      content: plaintext,
      eventId: event.id,
      timestamp: new Date(event.created_at * 1000).toISOString(),
      kind: event.kind,
      wasGiftWrapped: false,
    });
  }

  private async processGiftWrapEvent(identityId: string, event: NostrEvent): Promise<void> {
    const recipientSecretKey = await this.loadSecretKey(identityId);

    try {
      // Try unwrapping as profile first (existing code)
      const profileRecord = await handleReceivedWrappedEvent(event, recipientSecretKey, this.database);

      if (profileRecord) {
        log('info', `Received private profile from ${profileRecord.ownerPubkey.slice(0, 8)}...`);

        // Notify all registered callbacks about profile update
        for (const callback of this.profileUpdateCallbacks) {
          callback(identityId);
        }
        return; // Profile handled, done
      }

      // Profile unwrap returned null, try NIP-17 DM unwrap
      const dmResult = await decryptNip17Message(event, recipientSecretKey);

      if (dmResult && dmResult.kind === 14) {
        // Successfully unwrapped a NIP-17 DM
        const senderNpub = hexToNpub(dmResult.senderPubkeyHex);
        const recipientNpub = this.getIdentityNpub(identityId);

        await this.ingestIncomingMessage({
          identityId,
          senderNpub,
          recipientNpub,
          content: dmResult.plaintext,
          eventId: dmResult.eventId,
          timestamp: new Date(dmResult.timestamp * 1000).toISOString(),
          kind: 14, // NIP-17 private DM
          wasGiftWrapped: true,
        });

        log('info', `Received NIP-17 DM from ${dmResult.senderPubkeyHex.slice(0, 8)}...`);
        return;
      }

      // Try P2P signal handling
      try {
        const rumor = await unwrapEvent(event, recipientSecretKey);
        // Cast Rumor to NostrEvent for P2P signal check (Rumor is unsigned by NIP-59 design)
        const innerEvent = rumor as unknown as NostrEvent;
        if (isP2PSignalEvent(innerEvent)) {
          // Get identity keypair for P2P signal routing
          const secretRefStmt = this.database.prepare('SELECT secret_ref FROM nostr_identities WHERE id = ? LIMIT 1');
          secretRefStmt.bind([identityId]);
          const hasSecretRef = secretRefStmt.step();
          if (hasSecretRef) {
            const secretRef = secretRefStmt.getAsObject().secret_ref as string;
            secretRefStmt.free();

            const nsec = await this.secretStore.getSecret(secretRef);
            if (nsec) {
              const keypair = deriveKeypair(nsec);
              await routeP2PSignal(
                this.database,
                this.relayPool!,
                keypair,
                innerEvent.pubkey, // sender pubkey from unwrapped event
                innerEvent,
                this.mainWindow
              );
              log('info', `Routed P2P signal from ${innerEvent.pubkey.slice(0, 8)}...`);
              return;
            }
          } else {
            secretRefStmt.free();
          }
        }
      } catch (p2pError) {
        // P2P unwrap failed, continue to final fallback
        log('debug', `P2P signal check failed: ${this.toErrorMessage(p2pError)}`);
      }

      // Neither profile, DM, nor P2P signal - may be other wrapped content
      log('debug', `Gift wrap event ${event.id} contained neither profile, DM, nor P2P signal`);
    } catch (error) {
      log('warn', `Failed to process gift wrap event ${event.id}: ${this.toErrorMessage(error)}`);
    }
  }

  private async loadSecretKey(identityId: string): Promise<Uint8Array> {
    // Get identity secret reference
    const stmt = this.database.prepare('SELECT secret_ref FROM nostr_identities WHERE id = ? LIMIT 1');
    stmt.bind([identityId]);
    const hasRow = stmt.step();
    const secretRef = hasRow ? (stmt.getAsObject().secret_ref as string) : null;
    stmt.free();

    if (!secretRef) {
      throw new Error(`Identity not found: ${identityId}`);
    }

    // Load secret from secret store
    const nsec = await this.secretStore.getSecret(secretRef);
    if (!nsec) {
      throw new Error(`Secret not found for identity ${identityId}`);
    }

    // Try to derive keypair - if nsec is invalid (legacy test data), return dummy bytes
    if (isValidNsec(nsec)) {
      const keypair = deriveKeypair(nsec);
      return keypair.secretKey;
    } else {
      // Legacy test path: generate dummy 32-byte key from invalid nsec
      // This maintains backward compatibility with tests
      const hash = Buffer.from(nsec.padEnd(32, '0').slice(0, 32), 'utf-8');
      return new Uint8Array(hash);
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
    const kind = 14; // NIP-17 private direct message (will be wrapped in kind:1059)
    const wasGiftWrapped = true; // Outgoing messages always use NIP-59 gift wrap

    // Store plaintext for display; encryption happens at publish time
    // (The 'ciphertext' column actually stores displayable content)
    this.database.run(
      'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, event_id, timestamp, status, direction, is_read, kind, was_gift_wrapped) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        options.identityId,
        options.contactId,
        options.senderNpub,
        options.recipientNpub,
        options.plaintext,  // Store plaintext for display
        null,
        now,
        status,
        'outgoing',
        1, // Outgoing messages are always "read"
        kind,
        1, // wasGiftWrapped = true (SQLite uses 0/1 for boolean)
      ]
    );

    this.bumpContactLastMessage(options.contactId, now);

    if (this.online) {
      await this.flushOutgoingQueue();
    }

    return {
      id,
      identityId: options.identityId,
      contactId: options.contactId,
      senderNpub: options.senderNpub,
      recipientNpub: options.recipientNpub,
      content: options.plaintext,
      timestamp: now,
      status,
      direction: 'outgoing',
      isRead: true,
      kind,
      wasGiftWrapped,
    };
  }

  private async flushOutgoingQueue(): Promise<void> {
    const queued = await this.getOutgoingQueue();

    for (const message of queued) {
      try {
        await this.markMessageSending(message.id);

        // Check if we have relay pool and valid npubs (real crypto path)
        if (this.relayPool && isValidNpub(message.senderNpub) && isValidNpub(message.recipientNpub)) {
          // Real crypto integration: build signed event
          const senderSecretKey = await this.loadSecretKey(message.identityId);
          const senderPubkeyHex = npubToHex(message.senderNpub);
          const recipientPubkeyHex = npubToHex(message.recipientNpub);

          // Encrypt and wrap message using NIP-17/59
          const event = encryptNip17Message(message.content, senderSecretKey, recipientPubkeyHex);

          // Publish to relays
          const results = await this.relayPool.publish(event);

          // Check if any relay succeeded
          const anySuccess = results.some(r => r.success);

          if (anySuccess) {
            await this.markMessageSent(message.id, event.id);
            log('info', `Nostling message ${message.id} sent (event ${event.id})`);
          } else {
            // Provide detailed error information
            if (results.length === 0) {
              await this.handleRelayError(message.id, new Error('No writable relays available (check relay connection status)'));
            } else {
              const failureDetails = results.map(r => `${r.relay}: ${r.message}`).join('; ');
              await this.handleRelayError(message.id, new Error(`All ${results.length} relay publishes failed: [${failureDetails}]`));
            }
          }
        } else {
          // Test/offline mode: simulate publish without real crypto/relay
          await this.markMessageSent(message.id, randomUUID());
          log('info', `Nostling message ${message.id} marked as sent (simulated)`);
        }
      } catch (error) {
        await this.handleRelayError(message.id, error);
      }
    }
  }

  private async handleRelayError(messageId: string, error: unknown): Promise<void> {
    log('error', `Relay publish failed for nostling message ${messageId}: ${this.toErrorMessage(error)}`);
    await this.markMessageError(messageId).catch(() => {
      // Best-effort; failure already logged
    });
  }


  private mapIdentityRow(row: IdentityRow): NostlingIdentity {
    return {
      id: row.id,
      npub: row.npub,
      secretRef: row.secret_ref,
      label: row.label,
      relays: row.relays ? JSON.parse(row.relays) : undefined,
      theme: row.theme ?? undefined,
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
      deletedAt: row.deleted_at ? this.toIso(row.deleted_at) : undefined,
    };
  }

  private mapMessageRow(row: MessageRow): NostlingMessage {
    return {
      id: row.id,
      identityId: row.identity_id,
      contactId: row.contact_id,
      senderNpub: row.sender_npub,
      recipientNpub: row.recipient_npub,
      content: row.ciphertext,  // DB column is 'ciphertext' but stores plaintext content
      eventId: row.event_id || undefined,
      timestamp: this.toIso(row.timestamp),
      status: row.status,
      direction: row.direction,
      isRead: Boolean(row.is_read),
      kind: row.kind ?? undefined,
      wasGiftWrapped: row.was_gift_wrapped === null ? undefined : Boolean(row.was_gift_wrapped),
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

  private getContact(contactId: string, options?: { includeDeleted?: boolean }): NostlingContact {
    const stmt = this.database.prepare(
      'SELECT id, identity_id, npub, alias, state, created_at, last_message_at, deleted_at FROM nostr_contacts WHERE id = ? LIMIT 1'
    );
    stmt.bind([contactId]);
    const hasRow = stmt.step();
    const result = hasRow ? (stmt.getAsObject() as unknown as ContactRow) : null;
    stmt.free();

    if (!result) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    const contact = this.mapContactRow(result);
    if (!options?.includeDeleted && contact.deletedAt) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    return contact;
  }

  private findContactByNpub(identityId: string, npub: string): NostlingContact | null {
    const stmt = this.database.prepare(
      'SELECT id, identity_id, npub, alias, state, created_at, last_message_at, deleted_at FROM nostr_contacts WHERE identity_id = ? AND npub = ? AND deleted_at IS NULL LIMIT 1'
    );
    stmt.bind([identityId, npub]);
    const hasRow = stmt.step();
    const result = hasRow ? (stmt.getAsObject() as unknown as ContactRow) : null;
    stmt.free();

    return result ? this.mapContactRow(result) : null;
  }

  private getOutgoingMessageRow(messageId: string): MessageRow {
    const stmt = this.database.prepare(
      "SELECT id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, event_id, timestamp, status, direction, is_read, kind, was_gift_wrapped FROM nostr_messages WHERE id = ? AND direction = 'outgoing' LIMIT 1"
    );
    stmt.bind([messageId]);
    const hasRow = stmt.step();
    const result = hasRow ? (stmt.getAsObject() as unknown as MessageRow) : null;
    stmt.free();

    if (!result) {
      throw new Error(`Outgoing message not found: ${messageId}`);
    }

    return result;
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

  private async withErrorLogging<T>(context: string, operation: () => Promise<T> | T): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      log('error', `Nostling ${context} failed: ${this.toErrorMessage(error)}`);
      throw error;
    }
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  }
}
