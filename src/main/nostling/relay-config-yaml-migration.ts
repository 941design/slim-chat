/**
 * Relay Config YAML Migration
 *
 * Handles migration of relay configs from JSON to YAML format with backwards compatibility.
 * Each identity has its own relay config file in identities/<id>/relays.[yaml|json].
 * This module provides functions for reading and writing relay configs with automatic migration.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { NostlingRelayEndpoint } from '../../shared/types';
import {
  parseYaml,
  buildRelayConfigYaml,
  stringifyYaml,
} from '../yaml-utils';
import { log } from '../logging';

/**
 * getRelayConfigPaths(identityDir: string): { yaml: string, json: string }
 *
 * CONTRACT:
 *   Inputs:
 *     - identityDir: string, absolute path to identity directory (identities/<id>)
 *
 *   Outputs:
 *     - object with two paths:
 *       * yaml: absolute path to relays.yaml in identity dir
 *       * json: absolute path to relays.json in identity dir
 *
 *   Invariants:
 *     - Both paths are in same directory (identityDir)
 *     - YAML path ends with "relays.yaml"
 *     - JSON path ends with "relays.json"
 *     - Paths are absolute, not relative
 *
 *   Properties:
 *     - Deterministic: same paths for same identityDir
 *     - Directory may not exist yet (caller must create)
 *
 * Returns paths to both relay config formats for an identity.
 */
export function getRelayConfigPaths(identityDir: string): { yaml: string; json: string } {
  return {
    yaml: path.join(identityDir, 'relays.yaml'),
    json: path.join(identityDir, 'relays.json'),
  };
}

// Trivial implementation - fully implemented

/**
 * computeFileHashYaml(content: string): string
 *
 * CONTRACT:
 *   Inputs:
 *     - content: string, file content to hash
 *
 *   Outputs:
 *     - string: SHA-256 hash in hexadecimal format
 *
 *   Invariants:
 *     - Hash is deterministic: same content produces same hash
 *     - Hash length is always 64 characters (SHA-256 hex)
 *     - Hash is lowercase hexadecimal
 *
 *   Properties:
 *     - Collision resistance: different content produces different hash (with high probability)
 *     - Idempotent: hash(x) always equals hash(x)
 *     - Fast: suitable for frequent computation
 *
 *   Algorithm:
 *     1. Create SHA-256 hash instance
 *     2. Update with content as UTF-8
 *     3. Return digest as hexadecimal string
 *
 * Computes SHA-256 hash of file content for conflict detection.
 * Same hash algorithm as existing relay-config-manager, works for both JSON and YAML.
 */
export function computeFileHashYaml(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

// Trivial implementation - fully implemented

/**
 * checkForDualFormatRelay(identityDir: string): Promise<boolean>
 *
 * CONTRACT:
 *   Inputs:
 *     - identityDir: string, absolute path to identity directory
 *
 *   Outputs:
 *     - Promise<boolean>: true if both relays.yaml and relays.json exist, false otherwise
 *
 *   Invariants:
 *     - Only checks file existence, does not read or validate content
 *     - Returns false if only one format exists
 *     - Returns false if neither format exists
 *
 *   Properties:
 *     - Idempotent: safe to call multiple times
 *     - Non-destructive: does not modify filesystem
 *     - Fast: only checks existence, no I/O beyond stat
 *
 * Checks if both relay config formats exist for an identity (dual-format state).
 * Used to determine when to log deprecation warnings.
 */
export async function checkForDualFormatRelay(identityDir: string): Promise<boolean> {
  const paths = getRelayConfigPaths(identityDir);
  try {
    await Promise.all([
      fs.access(paths.yaml),
      fs.access(paths.json),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * loadRelaysYaml(identityDir: string, identityId: string, defaultRelays: NostlingRelayEndpoint[], fileHashes: Map<string, string>): Promise<NostlingRelayEndpoint[]>
 *
 * CONTRACT:
 *   Inputs:
 *     - identityDir: string, absolute path to identity directory
 *     - identityId: string, identity ID for logging and hash tracking
 *     - defaultRelays: NostlingRelayEndpoint[], default relays if no config exists
 *     - fileHashes: Map<string, string>, mutable map for storing file hashes (key: identityId)
 *
 *   Outputs:
 *     - Promise<NostlingRelayEndpoint[]>: loaded relay configuration, sorted by order field
 *
 *   Invariants:
 *     - Always returns array (never throws to caller)
 *     - Read priority: YAML first, then JSON, then defaults
 *     - Migration: if only JSON exists, read it and write YAML version
 *     - Original JSON preserved during migration (not deleted)
 *     - If both exist, YAML takes precedence (ignore JSON)
 *     - If neither exists, write YAML with defaults
 *     - Returned array is sorted by relay.order ascending
 *     - File hash updated in fileHashes map after successful read
 *     - Hash is computed from actual file content (not from returned array)
 *
 *   Properties:
 *     - Lazy migration: migration happens on first read
 *     - Idempotent migration: safe to call multiple times
 *     - Graceful degradation: malformed files are replaced with defaults and return defaultRelays
 *     - Directory creation: ensures identity directory exists
 *     - Hash tracking: enables conflict detection in saveRelaysYaml
 *
 *   Algorithm:
 *     1. Ensure identity directory exists (recursive, mode 0o700)
 *     2. Get YAML and JSON file paths
 *     3. Try to read YAML file:
 *        a. If YAML exists:
 *           i. Read content, compute hash, store in fileHashes
 *           ii. Parse YAML as array
 *           iii. Validate: if not array, log warning, return empty array
 *           iv. Sort by order field
 *           v. Return relays
 *        b. If YAML read fails with ENOENT: continue to JSON
 *        c. If YAML parse fails: log warning, continue to JSON
 *     4. Try to read JSON file:
 *        a. If JSON exists:
 *           i. Read content, parse as array
 *           ii. Validate: if not array, log warning, return empty array
 *           iii. Write YAML version (migration)
 *           iv. Compute hash of YAML content, store in fileHashes
 *           v. Log info: "Migrated relay config from JSON to YAML for identity {identityId}"
 *           vi. Sort by order field
 *           vii. Return relays
 *        b. If JSON read fails with ENOENT: continue to defaults
 *        c. If JSON parse fails: log warning, continue to defaults
 *     5. Neither exists:
 *        a. Write YAML with defaultRelays
 *        b. Compute hash of YAML content, store in fileHashes
 *        c. Return defaultRelays (already sorted)
 *     6. On filesystem errors (permission denied, etc.):
 *        a. Log error with details
 *        b. Throw error (relay loading is critical, can't silently fail)
 *
 *   Error Handling:
 *     - ENOENT: expected, handled gracefully (try next format)
 *     - Parse errors (YAML/JSON): log warning, try next format, fallback to defaults
 *     - Malformed data (not array): log warning, return empty array
 *     - Filesystem errors: log error and throw (caller must handle)
 *
 * Loads relay config with YAML-first strategy and automatic migration.
 */
export async function loadRelaysYaml(
  identityDir: string,
  identityId: string,
  defaultRelays: NostlingRelayEndpoint[],
  fileHashes: Map<string, string>
): Promise<NostlingRelayEndpoint[]> {
  try {
    await fs.mkdir(identityDir, { recursive: true, mode: 0o700 });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      log('error', `Failed to create identity directory ${identityDir}: ${error.message}`);
      throw error;
    }
  }

  const { yaml: yamlPath, json: jsonPath } = getRelayConfigPaths(identityDir);

  try {
    const yamlContent = await fs.readFile(yamlPath, 'utf-8');
    const hash = computeFileHashYaml(yamlContent);
    fileHashes.set(identityId, hash);

    const parseResult = parseYaml<NostlingRelayEndpoint[]>(yamlContent);
    if (!parseResult.success) {
      log('warn', `Failed to parse YAML relay config for identity ${identityId}: ${parseResult.error?.message}`);
      // Graceful degradation: recreate with defaults
      const yamlFixContent = buildRelayConfigYaml(defaultRelays);
      await fs.writeFile(yamlPath, yamlFixContent, { encoding: 'utf-8', mode: 0o600 });
      const newHash = computeFileHashYaml(yamlFixContent);
      fileHashes.set(identityId, newHash);
      return defaultRelays;
    } else {
      const relays = parseResult.data;
      if (!Array.isArray(relays)) {
        log('warn', `Malformed YAML relay config for identity ${identityId}: expected array, got ${typeof relays}`);
        // Graceful degradation: recreate with defaults
        const yamlFixContent = buildRelayConfigYaml(defaultRelays);
        await fs.writeFile(yamlPath, yamlFixContent, { encoding: 'utf-8', mode: 0o600 });
        const newHash = computeFileHashYaml(yamlFixContent);
        fileHashes.set(identityId, newHash);
        return defaultRelays;
      }
      relays.sort((a, b) => a.order - b.order);
      return relays;
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      log('error', `Failed to read YAML relay config for identity ${identityId}: ${error.message}`);
      throw error;
    }
  }

  try {
    const jsonContent = await fs.readFile(jsonPath, 'utf-8');
    const relays = JSON.parse(jsonContent);

    if (!Array.isArray(relays)) {
      log('warn', `Malformed JSON relay config for identity ${identityId}: expected array, got ${typeof relays}`);
      // Graceful degradation: create YAML with defaults
      const yamlFixContent = buildRelayConfigYaml(defaultRelays);
      await fs.writeFile(yamlPath, yamlFixContent, { encoding: 'utf-8', mode: 0o600 });
      const hash = computeFileHashYaml(yamlFixContent);
      fileHashes.set(identityId, hash);
      return defaultRelays;
    }

    const yamlContent = buildRelayConfigYaml(relays);
    await fs.writeFile(yamlPath, yamlContent, { encoding: 'utf-8', mode: 0o600 });

    const hash = computeFileHashYaml(yamlContent);
    fileHashes.set(identityId, hash);

    log('info', `Migrated relay config from JSON to YAML for identity ${identityId}`);

    relays.sort((a, b) => a.order - b.order);
    return relays;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      const yamlContent = buildRelayConfigYaml(defaultRelays);
      await fs.writeFile(yamlPath, yamlContent, { encoding: 'utf-8', mode: 0o600 });

      const hash = computeFileHashYaml(yamlContent);
      fileHashes.set(identityId, hash);

      return defaultRelays;
    }

    if (error instanceof SyntaxError) {
      log('warn', `Failed to parse JSON relay config for identity ${identityId}: ${error.message}`);
      const yamlContent = buildRelayConfigYaml(defaultRelays);
      await fs.writeFile(yamlPath, yamlContent, { encoding: 'utf-8', mode: 0o600 });

      const hash = computeFileHashYaml(yamlContent);
      fileHashes.set(identityId, hash);

      return defaultRelays;
    }

    log('error', `Failed to load relay config for identity ${identityId}: ${error.message}`);
    throw error;
  }
}

/**
 * saveRelaysYaml(identityDir: string, identityId: string, relays: NostlingRelayEndpoint[], fileHashes: Map<string, string>): Promise<RelayConfigResult>
 *
 * CONTRACT:
 *   Inputs:
 *     - identityDir: string, absolute path to identity directory
 *     - identityId: string, identity ID for logging and hash tracking
 *     - relays: NostlingRelayEndpoint[], relay configuration to save
 *     - fileHashes: Map<string, string>, map with stored file hashes for conflict detection
 *
 *   Outputs:
 *     - Promise<RelayConfigResult>: result object with either success (config) or conflict info
 *       Success: { config: saved_relays, conflict: undefined }
 *       Conflict: { config: undefined, conflict: { conflicted: true, message: "..." } }
 *
 *   Invariants:
 *     - Conflict detection: before write, check current file hash matches stored hash
 *     - If conflict detected: return conflict result, don't write
 *     - If no conflict or no stored hash: write files
 *     - Always writes to YAML (primary format)
 *     - If JSON file exists, also writes to JSON (dual-write)
 *     - If only YAML exists, only writes YAML
 *     - Uses atomic writes: write to .tmp then rename
 *     - After successful write: update stored hash with new hash
 *     - YAML file includes header comments
 *     - JSON file has no comments
 *
 *   Properties:
 *     - Conflict detection prevents external modifications from being overwritten
 *     - Atomic writes: readers never see partial writes
 *     - Dual-write safety: supports downgrade to JSON-only readers
 *     - Hash consistency: after success, stored hash matches actual file
 *
 *   Algorithm:
 *     1. Ensure identity directory exists (recursive, mode 0o700)
 *     2. Get YAML and JSON file paths
 *     3. Conflict detection for YAML:
 *        a. If YAML file exists and we have stored hash:
 *           i. Read current YAML content
 *           ii. Compute current hash
 *           iii. Compare with stored hash
 *           iv. If different: return conflict result with message
 *        b. If YAML doesn't exist or no stored hash: proceed (no conflict possible)
 *     4. Write YAML file:
 *        a. Build YAML with comments using buildRelayConfigYaml(relays)
 *        b. Write to {yaml}.tmp with mode 0o600
 *        c. Rename {yaml}.tmp to {yaml} (atomic)
 *        d. Compute hash of YAML content
 *        e. Store hash in fileHashes[identityId]
 *     5. Check if JSON file exists:
 *        a. If JSON exists: write to JSON (dual-write)
 *           i. Stringify relays with 2-space indent
 *           ii. Write to {json}.tmp with mode 0o600
 *           iii. Rename {json}.tmp to {json} (atomic)
 *        b. If JSON doesn't exist: skip JSON write
 *     6. Return success: { config: relays, conflict: undefined }
 *     7. On error:
 *        a. Log error with details
 *        b. Throw error (relay saving is critical)
 *
 *   Error Handling:
 *     - Conflict detected: return conflict result (not an error)
 *     - Filesystem errors: log and throw
 *     - Never silently fails (relay persistence is critical)
 *
 * Saves relay config with conflict detection and dual-write support.
 */
export interface SaveRelaysYamlResult {
  config?: NostlingRelayEndpoint[];
  conflict?: {
    conflicted: true;
    message: string;
  };
}

export async function saveRelaysYaml(
  identityDir: string,
  identityId: string,
  relays: NostlingRelayEndpoint[],
  fileHashes: Map<string, string>
): Promise<SaveRelaysYamlResult> {
  try {
    await fs.mkdir(identityDir, { recursive: true, mode: 0o700 });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      log('error', `Failed to create identity directory ${identityDir}: ${error.message}`);
      throw error;
    }
  }

  const { yaml: yamlPath, json: jsonPath } = getRelayConfigPaths(identityDir);

  const storedHash = fileHashes.get(identityId);
  if (storedHash) {
    try {
      const currentContent = await fs.readFile(yamlPath, 'utf-8');
      const currentHash = computeFileHashYaml(currentContent);

      if (currentHash !== storedHash) {
        return {
          conflict: {
            conflicted: true,
            message: 'Relay configuration was modified externally. Reload to get latest changes.',
          },
        };
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        log('error', `Failed to read YAML relay config for conflict detection: ${error.message}`);
        throw error;
      }
    }
  }

  try {
    const yamlContent = buildRelayConfigYaml(relays);
    const yamlTempPath = yamlPath + '.tmp';

    await fs.writeFile(yamlTempPath, yamlContent, { encoding: 'utf-8', mode: 0o600 });
    await fs.rename(yamlTempPath, yamlPath);

    const newHash = computeFileHashYaml(yamlContent);
    fileHashes.set(identityId, newHash);

    try {
      await fs.access(jsonPath);
      const jsonContent = JSON.stringify(relays, null, 2);
      const jsonTempPath = jsonPath + '.tmp';

      await fs.writeFile(jsonTempPath, jsonContent, { encoding: 'utf-8', mode: 0o600 });
      await fs.rename(jsonTempPath, jsonPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        log('error', `Failed to write JSON relay config (dual-write): ${error.message}`);
        throw error;
      }
    }

    return {
      config: relays,
    };
  } catch (error: any) {
    log('error', `Failed to save relay config for identity ${identityId}: ${error.message}`);
    throw error;
  }
}
