import { promises as fs } from 'fs';
import path from 'path';
import { NostlingRelayEndpoint, RelayConfigResult } from '../../shared/types';
import { log } from '../logging';
import { logDeprecationWarning } from '../yaml-utils';
import { loadRelaysYaml, saveRelaysYaml, checkForDualFormatRelay } from './relay-config-yaml-migration';

/**
 * Default relay endpoints for new identities
 * Includes public relays (read+write), archive relays (read-only), and blast relays (write-only)
 */
export const DEFAULT_RELAYS: NostlingRelayEndpoint[] = [
  // Public general-purpose relays (read + write)
  { url: 'wss://relay.damus.io', read: true, write: true, order: 0 },
  { url: 'wss://relay.primal.net', read: true, write: true, order: 1 },
  { url: 'wss://nos.lol', read: true, write: true, order: 2 },
  { url: 'wss://relay.nostr.band', read: true, write: true, order: 3 },
  { url: 'wss://nostr.wine', read: true, write: true, order: 4 },
  { url: 'wss://relay.snort.social', read: true, write: true, order: 5 },
  { url: 'wss://relay.nostr.bg', read: true, write: true, order: 6 },
  { url: 'wss://nostr-pub.wellorder.net', read: true, write: true, order: 7 },
];

/**
 * RelayConfigManager
 *
 * Manages filesystem-based relay configuration with per-identity storage.
 * Provides hash-based overwrite protection and graceful error handling.
 */
export class RelayConfigManager {
  private configDir: string;
  private fileHashes: Map<string, string>;
  private writeLocks: Map<string, Promise<void>>;

  constructor(configDir: string) {
    this.configDir = configDir;
    this.fileHashes = new Map();
    this.writeLocks = new Map();
  }


  /**
   * loadRelays(identityId)
   *
   * CONTRACT:
   *   Inputs:
   *     - identityId: non-empty string, identity whose relays to load
   *
   *   Outputs:
   *     - relays: array of NostlingRelayEndpoint objects, sorted by order field
   *
   *   Invariants:
   *     - Output array is sorted by order field (ascending)
   *     - Each relay has valid url (non-empty), read (boolean), write (boolean), order (non-negative integer)
   *     - If file doesn't exist, returns DEFAULT_RELAYS and creates file
   *     - If file is malformed JSON, logs warning and returns empty array (no crash)
   *     - After successful load, stores file hash for overwrite protection
   *
   *   Properties:
   *     - Graceful degradation: malformed file → empty array, not crash
   *     - Self-healing: missing file → create with defaults
   *     - Sorted output: output[i].order ≤ output[i+1].order for all i
   *
   *   Algorithm:
   *     1. Compute config file path for identityId
   *     2. Check if file exists
   *     3. If file doesn't exist:
   *        a. Create directory structure
   *        b. Write DEFAULT_RELAYS to file (pretty-printed JSON)
   *        c. Store hash of written content
   *        d. Return DEFAULT_RELAYS
   *     4. If file exists:
   *        a. Read file content
   *        b. Compute and store hash of content
   *        c. Parse JSON (catch errors)
   *        d. If parse fails: log warning, return empty array
   *        e. If parse succeeds: validate structure, sort by order, return
   */
  /**
   * Get default relays, respecting NOSTLING_DEV_RELAY environment variable.
   * When set, uses only the dev relay as default instead of production relays.
   */
  private getDefaultRelays(): NostlingRelayEndpoint[] {
    const devRelayUrl = process.env.NOSTLING_DEV_RELAY;
    if (devRelayUrl) {
      log('info', `Using dev relay: ${devRelayUrl}`);
      return [{ url: devRelayUrl, read: true, write: true, order: 0 }];
    }
    return DEFAULT_RELAYS;
  }

  async loadRelays(identityId: string): Promise<NostlingRelayEndpoint[]> {
    // When NOSTLING_DEV_RELAY is set, always use dev relay (overrides config file)
    const devRelayUrl = process.env.NOSTLING_DEV_RELAY;
    if (devRelayUrl) {
      log('info', `[relay-config] Dev mode: using only dev relay ${devRelayUrl} (suppressing production relays)`);
      return [{ url: devRelayUrl, read: true, write: true, order: 0 }];
    }

    const identityDir = path.join(this.configDir, 'identities', identityId);
    const defaultRelays = this.getDefaultRelays();
    const relays = await loadRelaysYaml(identityDir, identityId, defaultRelays, this.fileHashes);

    // Check for dual-format and log deprecation warning (FR-5)
    if (await checkForDualFormatRelay(identityDir)) {
      logDeprecationWarning('relay', identityId);
    }

    return relays;
  }

  /**
   * saveRelays(identityId, relays)
   *
   * CONTRACT:
   *   Inputs:
   *     - identityId: non-empty string, identity whose relays to save
   *     - relays: array of NostlingRelayEndpoint, relay configuration to persist
   *
   *   Outputs:
   *     - RelayConfigResult: object containing either success (config) or conflict info
   *       success case: { config: saved_relays, conflict: undefined }
   *       conflict case: { config: undefined, conflict: { conflicted: true, message: "..." } }
   *
   *   Invariants:
   *     - File is written atomically (write to temp, then rename)
   *     - Before write: check current file hash matches stored hash
   *     - If hashes differ: return conflict, don't write
   *     - If hashes match or no stored hash: write file, update stored hash
   *     - JSON is pretty-printed with 2-space indentation
   *     - After successful write: stored hash matches actual file hash
   *
   *   Properties:
   *     - Conflict detection: if file changed externally, detect before overwrite
   *     - Atomic write: partial writes never visible to readers
   *     - Hash consistency: after successful write, stored hash equals actual hash
   *
   *   Algorithm:
   *     1. Compute config file path
   *     2. Check if we have a stored hash for this file
   *     3. If stored hash exists:
   *        a. Read current file content
   *        b. Compute current file hash
   *        c. If current hash ≠ stored hash: return conflict result
   *     4. Serialize relays to pretty-printed JSON (2 spaces)
   *     5. Write JSON to temporary file in same directory
   *     6. Rename temporary file to target file (atomic)
   *     7. Compute and store hash of new content
   *     8. Return success result with saved relays
   */
  async saveRelays(identityId: string, relays: NostlingRelayEndpoint[]): Promise<RelayConfigResult> {
    // Wait for any pending write to complete
    const existingLock = this.writeLocks.get(identityId);
    if (existingLock) {
      await existingLock;
    }

    // Create new lock
    let resolveLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.writeLocks.set(identityId, lockPromise);

    try {
      const identityDir = path.join(this.configDir, 'identities', identityId);
      const result = await saveRelaysYaml(identityDir, identityId, relays, this.fileHashes);

      if (result.conflict) {
        return {
          conflict: result.conflict
        };
      }

      return {
        config: {
          defaults: relays,
          perIdentity: { [identityId]: relays }
        }
      };
    } catch (error) {
      log('error', `Failed to save relays for identity ${identityId}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      resolveLock!();
      this.writeLocks.delete(identityId);
    }
  }

  /**
   * reloadRelays(identityId)
   *
   * CONTRACT:
   *   Inputs:
   *     - identityId: non-empty string, identity whose relays to reload from disk
   *
   *   Outputs:
   *     - relays: array of NostlingRelayEndpoint, fresh data from file
   *
   *   Invariants:
   *     - Discards any stored hash (forces fresh load)
   *     - Reads current file content regardless of previous state
   *     - Stores new hash after reload
   *
   *   Properties:
   *     - Discards in-memory state: ignores previous hash
   *     - Idempotent with loadRelays: reloadRelays(id) behaves like first loadRelays(id)
   *
   *   Algorithm:
   *     1. Remove stored hash for this identityId (if exists)
   *     2. Call loadRelays(identityId)
   *     3. Return result
   */
  async reloadRelays(identityId: string): Promise<NostlingRelayEndpoint[]> {
    this.fileHashes.delete(identityId);
    return this.loadRelays(identityId);
  }

  /**
   * migrateFromDatabase(database, identities)
   *
   * CONTRACT:
   *   Inputs:
   *     - database: sql.js Database instance, source of relay data
   *     - identities: array of objects with `id` field, identities to migrate
   *
   *   Outputs:
   *     - Promise resolving to void
   *
   *   Invariants:
   *     - Migration runs only once (idempotent via marker file)
   *     - For each identity: read relays from `nostr_relays` table
   *     - For each relay: create NostlingRelayEndpoint with url, read=true, write=true, order based on row order
   *     - Write relays to filesystem for each identity
   *     - After successful migration: create `.relay-migration-complete` marker file
   *     - If marker file exists: skip migration entirely (no-op)
   *     - If migration fails partially: continue with remaining identities (log errors)
   *
   *   Properties:
   *     - Idempotent: running twice has same effect as running once
   *     - Graceful degradation: per-identity failures don't block other identities
   *     - Data preservation: all relays from database are written to filesystem
   *
   *   Algorithm:
   *     1. Check for marker file `.relay-migration-complete` in configDir
   *     2. If marker exists: log "migration already complete", return
   *     3. For each identity:
   *        a. Query `nostr_relays` table: SELECT url FROM nostr_relays WHERE identity_id = ?
   *        b. If no rows: skip this identity (will get defaults on first load)
   *        c. If rows exist: map to NostlingRelayEndpoint objects with read=true, write=true, order by index
   *        d. Call saveRelays(identityId, relays)
   *        e. If saveRelays fails: log error, continue with next identity
   *     4. Create marker file `.relay-migration-complete` in configDir
   *     5. Log "migration complete"
   */
  async migrateFromDatabase(database: any, identities: Array<{ id: string }>): Promise<void> {
    const markerPath = path.join(this.configDir, '.relay-migration-complete');

    try {
      await fs.access(markerPath);
      log('info', 'Relay migration already complete, skipping');
      return;
    } catch {
      // Marker doesn't exist, proceed with migration
    }

    let allMigrationsSucceeded = true;

    for (const identity of identities) {
      try {
        const stmt = database.prepare('SELECT url FROM nostr_relays WHERE identity_id = ? ORDER BY ROWID ASC');
        stmt.bind([identity.id]);

        const relays: NostlingRelayEndpoint[] = [];
        let order = 0;

        while (stmt.step()) {
          const row = stmt.getAsObject() as unknown as { url: string };
          relays.push({
            url: row.url,
            read: true,
            write: true,
            order: order++,
          });
        }

        stmt.free();

        if (relays.length > 0) {
          try {
            await this.saveRelays(identity.id, relays);
            log('info', `Migrated ${relays.length} relays for identity ${identity.id}`);
          } catch (error) {
            log('error', `Failed to save migrated relays for identity ${identity.id}: ${error instanceof Error ? error.message : String(error)}`);
            allMigrationsSucceeded = false;
          }
        }
      } catch (error) {
        log('error', `Failed to migrate relays for identity ${identity.id}: ${error instanceof Error ? error.message : String(error)}`);
        allMigrationsSucceeded = false;
      }
    }

    if (allMigrationsSucceeded) {
      try {
        await fs.writeFile(markerPath, '');
        log('info', 'Relay migration complete');
      } catch (error) {
        log('error', `Failed to create migration marker file: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      log('warn', 'Relay migration incomplete - some identities failed to migrate');
    }
  }
}
