/**
 * Service Display Name Tests
 *
 * Property-based tests verifying that service.listContacts() and service.listIdentities()
 * correctly populate the profileName field with display names resolved using correct precedence.
 *
 * Precedence: alias > private > public > npub
 */

import * as fc from 'fast-check';
import initSqlJs, { Database } from 'sql.js';
import { randomUUID } from 'node:crypto';
import { NostlingService } from './service';
import { NostlingSecretStore } from './secret-store';
import { runMigrations } from '../database/migrations';
import { generateKeypair, npubToHex } from './crypto';

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

let SQL: any;
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
});

afterEach(() => {
  database.close();
});

// ============================================================================
// Helper Functions
// ============================================================================

function storePrivateReceivedProfile(pubkeyHex: string, profileName: string): void {
  const profileId = randomUUID();
  const contentJson = JSON.stringify({ name: profileName });
  database.run(
    'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, valid_signature) VALUES (?, ?, ?, ?, ?)',
    [profileId, pubkeyHex, 'private_received', contentJson, 1]
  );
}

function storePrivateAuthoredProfile(pubkeyHex: string, profileName: string): void {
  const profileId = randomUUID();
  const contentJson = JSON.stringify({ name: profileName });
  database.run(
    'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, valid_signature) VALUES (?, ?, ?, ?, ?)',
    [profileId, pubkeyHex, 'private_authored', contentJson, 1]
  );
}

function storePublicProfile(pubkeyHex: string, profileName: string): void {
  const profileId = randomUUID();
  const contentJson = JSON.stringify({ name: profileName });
  database.run(
    'INSERT INTO nostr_profiles (id, owner_pubkey, source, content_json, valid_signature) VALUES (?, ?, ?, ?, ?)',
    [profileId, pubkeyHex, 'public_discovered', contentJson, 1]
  );
}

// ============================================================================
// Property-Based Tests: Contacts
// ============================================================================

describe('NostlingService - Contact Display Names', () => {
  test('contact without explicit alias uses npub as profileName (default behavior)', async () => {
    const keypair = generateKeypair();
    const identity = await service.createIdentity({
      label: 'Test Identity',
      npub: keypair.keypair.npub,
      nsec: keypair.nsec,
    });

    const contactKeypair = generateKeypair();
    const contact = await service.addContact({
      identityId: identity.id,
      npub: contactKeypair.keypair.npub,
    });

    const contactPubkeyHex = npubToHex(contactKeypair.keypair.npub);
    storePrivateReceivedProfile(contactPubkeyHex, 'ShouldBeIgnored');

    const contacts = await service.listContacts(identity.id);
    const retrievedContact = contacts.find(c => c.id === contact.id);

    expect(retrievedContact).toBeDefined();
    expect(retrievedContact!.profileName).toBe(contactKeypair.keypair.npub);
  });

  test('contact with alias prioritizes alias over private profile', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && s !== 'alias'),
        async (alias, profileName) => {
          const keypair = generateKeypair();
          const identity = await service.createIdentity({
            label: 'Test Identity',
            npub: keypair.keypair.npub,
            nsec: keypair.nsec,
          });

          const contactKeypair = generateKeypair();
          const contact = await service.addContact({
            identityId: identity.id,
            npub: contactKeypair.keypair.npub,
            alias: alias,
          });

          const contactPubkeyHex = npubToHex(contactKeypair.keypair.npub);
          storePrivateReceivedProfile(contactPubkeyHex, profileName);

          const contacts = await service.listContacts(identity.id);
          const retrievedContact = contacts.find(c => c.id === contact.id);

          return retrievedContact !== undefined && retrievedContact.profileName === alias.trim();
        }
      ),
      { numRuns: 20 }
    );
  });

  test('contact with explicit alias ignores public profile', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (alias, publicProfileName) => {
          fc.pre(alias.trim() !== publicProfileName.trim());

          const keypair = generateKeypair();
          const identity = await service.createIdentity({
            label: 'Test Identity',
            npub: keypair.keypair.npub,
            nsec: keypair.nsec,
          });

          const contactKeypair = generateKeypair();
          const contactPubkeyHex = npubToHex(contactKeypair.keypair.npub);

          storePublicProfile(contactPubkeyHex, publicProfileName);

          const contact = await service.addContact({
            identityId: identity.id,
            npub: contactKeypair.keypair.npub,
            alias: alias,
          });

          const contacts = await service.listContacts(identity.id);
          const retrievedContact = contacts.find(c => c.id === contact.id);

          return retrievedContact !== undefined && retrievedContact.profileName === alias.trim();
        }
      ),
      { numRuns: 20 }
    );
  });

  test('contact with explicit alias overrides both private and public profiles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (alias, privateProfileName, publicProfileName) => {
          fc.pre(alias.trim() !== privateProfileName.trim() && alias.trim() !== publicProfileName.trim());

          const keypair = generateKeypair();
          const identity = await service.createIdentity({
            label: 'Test Identity',
            npub: keypair.keypair.npub,
            nsec: keypair.nsec,
          });

          const contactKeypair = generateKeypair();
          const contactPubkeyHex = npubToHex(contactKeypair.keypair.npub);

          storePublicProfile(contactPubkeyHex, publicProfileName);
          storePrivateReceivedProfile(contactPubkeyHex, privateProfileName);

          const contact = await service.addContact({
            identityId: identity.id,
            npub: contactKeypair.keypair.npub,
            alias: alias,
          });

          const contacts = await service.listContacts(identity.id);
          const retrievedContact = contacts.find(c => c.id === contact.id);

          return retrievedContact !== undefined && retrievedContact.profileName === alias.trim();
        }
      ),
      { numRuns: 20 }
    );
  });

  test('contact profileName matches alias when set (service default behavior)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (alias) => {
          const keypair = generateKeypair();
          const identity = await service.createIdentity({
            label: 'Test Identity',
            npub: keypair.keypair.npub,
            nsec: keypair.nsec,
          });

          const contactKeypair = generateKeypair();
          const contact = await service.addContact({
            identityId: identity.id,
            npub: contactKeypair.keypair.npub,
            alias: alias,
          });

          const contacts = await service.listContacts(identity.id);
          const retrievedContact = contacts.find(c => c.id === contact.id);

          return retrievedContact !== undefined && retrievedContact.profileName === alias.trim();
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ============================================================================
// Property-Based Tests: Identities
// ============================================================================

describe('NostlingService - Identity Display Names', () => {
  test('identity label takes precedence even with private_authored profile', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (label, profileName) => {
          fc.pre(label.trim() !== profileName.trim());

          const keypair = generateKeypair();
          const pubkeyHex = npubToHex(keypair.keypair.npub);

          storePrivateAuthoredProfile(pubkeyHex, profileName);

          const identity = await service.createIdentity({
            label: label,
            npub: keypair.keypair.npub,
            nsec: keypair.nsec,
          });

          const identities = await service.listIdentities();
          const retrievedIdentity = identities.find(i => i.id === identity.id);

          return retrievedIdentity !== undefined && retrievedIdentity.profileName === label.trim();
        }
      ),
      { numRuns: 20 }
    );
  });

  test('identity with label prioritizes label over private profile', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (label, profileName) => {
          fc.pre(label.trim() !== profileName.trim());

          const keypair = generateKeypair();
          const identity = await service.createIdentity({
            label: label,
            npub: keypair.keypair.npub,
            nsec: keypair.nsec,
          });

          const pubkeyHex = npubToHex(keypair.keypair.npub);
          storePrivateAuthoredProfile(pubkeyHex, profileName);

          const identities = await service.listIdentities();
          const retrievedIdentity = identities.find(i => i.id === identity.id);

          return retrievedIdentity !== undefined && retrievedIdentity.profileName === label.trim();
        }
      ),
      { numRuns: 20 }
    );
  });

  test('identity label takes precedence over public profile', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (label, publicProfileName) => {
          fc.pre(label.trim() !== publicProfileName.trim());

          const keypair = generateKeypair();
          const pubkeyHex = npubToHex(keypair.keypair.npub);

          storePublicProfile(pubkeyHex, publicProfileName);

          const identity = await service.createIdentity({
            label: label,
            npub: keypair.keypair.npub,
            nsec: keypair.nsec,
          });

          const identities = await service.listIdentities();
          const retrievedIdentity = identities.find(i => i.id === identity.id);

          return retrievedIdentity !== undefined && retrievedIdentity.profileName === label.trim();
        }
      ),
      { numRuns: 20 }
    );
  });

  test('identity label takes precedence over both profiles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (label, privateProfileName, publicProfileName) => {
          fc.pre(label.trim() !== privateProfileName.trim() && label.trim() !== publicProfileName.trim());

          const keypair = generateKeypair();
          const pubkeyHex = npubToHex(keypair.keypair.npub);

          storePublicProfile(pubkeyHex, publicProfileName);
          storePrivateAuthoredProfile(pubkeyHex, privateProfileName);

          const identity = await service.createIdentity({
            label: label,
            npub: keypair.keypair.npub,
            nsec: keypair.nsec,
          });

          const identities = await service.listIdentities();
          const retrievedIdentity = identities.find(i => i.id === identity.id);

          return retrievedIdentity !== undefined && retrievedIdentity.profileName === label.trim();
        }
      ),
      { numRuns: 20 }
    );
  });

  test('identity profileName always matches label (service constraint)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (label) => {
          const keypair = generateKeypair();
          const identity = await service.createIdentity({
            label: label,
            npub: keypair.keypair.npub,
            nsec: keypair.nsec,
          });

          const identities = await service.listIdentities();
          const retrievedIdentity = identities.find(i => i.id === identity.id);

          return retrievedIdentity !== undefined && retrievedIdentity.profileName === label.trim();
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ============================================================================
// Example-Based Tests: Precedence Verification
// ============================================================================

describe('NostlingService - Display Name Precedence', () => {
  test('contacts always use alias as profileName (service sets npub as default alias)', async () => {
    const keypair = generateKeypair();
    const identity = await service.createIdentity({
      label: 'Test Identity',
      npub: keypair.keypair.npub,
      nsec: keypair.nsec,
    });

    const contactKeypair = generateKeypair();
    const contactPubkeyHex = npubToHex(contactKeypair.keypair.npub);

    storePublicProfile(contactPubkeyHex, 'PublicName');
    storePrivateReceivedProfile(contactPubkeyHex, 'PrivateName');

    const contact1 = await service.addContact({
      identityId: identity.id,
      npub: contactKeypair.keypair.npub,
    });

    let contacts = await service.listContacts(identity.id);
    let retrieved = contacts.find(c => c.id === contact1.id);
    expect(retrieved?.profileName).toBe(contactKeypair.keypair.npub);

    await service.updateContactAlias(contact1.id, 'AliasName');
    contacts = await service.listContacts(identity.id);
    retrieved = contacts.find(c => c.id === contact1.id);
    expect(retrieved?.profileName).toBe('AliasName');
  });

  test('identities always use label as profileName (service requires non-empty label)', async () => {
    const keypair = generateKeypair();
    const pubkeyHex = npubToHex(keypair.keypair.npub);

    storePublicProfile(pubkeyHex, 'PublicName');
    storePrivateAuthoredProfile(pubkeyHex, 'PrivateName');

    const identity = await service.createIdentity({
      label: 'InitialLabel',
      npub: keypair.keypair.npub,
      nsec: keypair.nsec,
    });

    let identities = await service.listIdentities();
    let retrieved = identities.find(i => i.id === identity.id);
    expect(retrieved?.profileName).toBe('InitialLabel');

    await service.updateIdentityLabel(identity.id, 'UpdatedLabel');
    identities = await service.listIdentities();
    retrieved = identities.find(i => i.id === identity.id);
    expect(retrieved?.profileName).toBe('UpdatedLabel');
  });
});
