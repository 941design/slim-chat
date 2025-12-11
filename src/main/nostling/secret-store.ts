import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';
import { randomUUID } from 'crypto';
import { log } from '../logging';

export type SecretStoreKind = 'local' | 'external';

export interface NostlingSecretStore {
  kind: SecretStoreKind;
  getSecret(ref: string): Promise<string | null>;
  saveSecret(secret: string, ref?: string): Promise<string>;
  deleteSecret(ref: string): Promise<void>;
  listSecretRefs(): Promise<string[]>;
}

export interface SecretStoreOptions {
  /**
   * Optional external provider implementation. When supplied, no secrets are
   * persisted locally and the reference returned from saveSecret should be
   * treated as opaque.
   */
  externalProvider?: NostlingSecretStore;
  /**
   * Override location for the local store payload. Primarily used for tests.
   */
  storagePath?: string;
}

interface LocalSecretPayload {
  refs: Record<string, string>;
}

class LocalSecretStore implements NostlingSecretStore {
  public readonly kind: SecretStoreKind = 'local';
  private readonly storagePath: string;

  constructor(storagePath?: string) {
    this.storagePath = storagePath || path.join(app.getPath('userData'), 'nostling-secrets.json');
  }

  async getSecret(ref: string): Promise<string | null> {
    const payload = this.readPayload();
    const encoded = payload.refs[ref];
    if (!encoded) {
      return null;
    }
    return this.decode(encoded);
  }

  async saveSecret(secret: string, ref?: string): Promise<string> {
    const targetRef = ref || this.generateRef();
    const payload = this.readPayload();
    payload.refs[targetRef] = this.encode(secret);
    this.persist(payload);
    return targetRef;
  }

  async deleteSecret(ref: string): Promise<void> {
    const payload = this.readPayload();
    if (payload.refs[ref]) {
      delete payload.refs[ref];
      this.persist(payload);
    }
  }

  async listSecretRefs(): Promise<string[]> {
    const payload = this.readPayload();
    return Object.keys(payload.refs);
  }

  private generateRef(): string {
    return `nostr-secret:${randomUUID()}`;
  }

  private encode(secret: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(secret).toString('base64');
    }

    log('warn', 'Electron safeStorage unavailable; falling back to base64 encoding for nostling secret storage');
    return Buffer.from(secret, 'utf8').toString('base64');
  }

  private decode(encoded: string): string {
    const buffer = Buffer.from(encoded, 'base64');
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(buffer);
      } catch (error) {
        log('error', `Failed to decrypt nostling secret with safeStorage: ${String(error)}`);
      }
    }

    return buffer.toString('utf8');
  }

  private readPayload(): LocalSecretPayload {
    try {
      const raw = fs.readFileSync(this.storagePath, 'utf8');
      const parsed = JSON.parse(raw) as LocalSecretPayload;
      if (!parsed?.refs || typeof parsed.refs !== 'object') {
        return { refs: {} };
      }
      return { refs: parsed.refs };
    } catch {
      return { refs: {} };
    }
  }

  private persist(payload: LocalSecretPayload): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), 'utf8');
  }
}

/**
 * Factory to choose the active secret-store implementation.
 *
 * - If an external provider is supplied, it is returned directly and is
 *   expected to handle its own persistence. No secrets are written to the
 *   local filesystem in that mode.
 * - Otherwise, a local encrypted store backed by Electron safeStorage is used.
 */
export function createSecretStore(options: SecretStoreOptions = {}): NostlingSecretStore {
  if (options.externalProvider) {
    log('info', 'Using external nostling secret store provider');
    return options.externalProvider;
  }

  const storagePath = options.storagePath;
  return new LocalSecretStore(storagePath);
}

export { LocalSecretStore };
