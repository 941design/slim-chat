/**
 * App Config YAML Migration
 *
 * Handles migration of app config from JSON to YAML format with backwards compatibility.
 * This module provides functions for reading and writing app config in both formats,
 * with automatic migration and dual-write support during transition period.
 */

import fs from 'fs';
import path from 'path';
import { AppConfig } from '../shared/types';
import { getUserDataPath } from './paths';
import {
  parseYaml,
  buildAppConfigYaml,
  logDeprecationWarning as logDeprecationWarningInternal,
  YamlParseResult,
} from './yaml-utils';
import { log } from './logging';

// Re-export logDeprecationWarning for external use
export { logDeprecationWarning } from './yaml-utils';

/**
 * getConfigFilePaths(): { yaml: string, json: string }
 *
 * CONTRACT:
 *   Inputs: none
 *
 *   Outputs:
 *     - object with two paths:
 *       * yaml: absolute path to config.yaml
 *       * json: absolute path to config.json (legacy)
 *
 *   Invariants:
 *     - Both paths are in same directory (getUserDataPath())
 *     - YAML path ends with "config.yaml"
 *     - JSON path ends with "config.json"
 *     - Paths are absolute, not relative
 *
 *   Properties:
 *     - Deterministic: same paths returned on each call during session
 *     - Directory may not exist yet (caller must create)
 *
 * Returns paths to both config file formats.
 */
export function getConfigFilePaths(): { yaml: string; json: string } {
  const dataPath = getUserDataPath();
  return {
    yaml: path.join(dataPath, 'config.yaml'),
    json: path.join(dataPath, 'config.json'),
  };
}

// Trivial implementation - fully implemented

/**
 * checkForDualFormat(): boolean
 *
 * CONTRACT:
 *   Inputs: none
 *
 *   Outputs:
 *     - boolean: true if both config.yaml and config.json exist, false otherwise
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
 * Checks if both config formats exist (dual-format state).
 * Used to determine when to log deprecation warnings.
 */
export function checkForDualFormat(): boolean {
  const paths = getConfigFilePaths();
  return fs.existsSync(paths.yaml) && fs.existsSync(paths.json);
}

// Trivial implementation - fully implemented

/**
 * loadConfigYaml(defaultConfig: AppConfig): AppConfig
 *
 * CONTRACT:
 *   Inputs:
 *     - defaultConfig: AppConfig object, default values for missing/invalid configs
 *
 *   Outputs:
 *     - AppConfig: loaded and normalized configuration
 *
 *   Invariants:
 *     - Always returns valid AppConfig (never throws)
 *     - Read priority: YAML first, then JSON, then defaults
 *     - Migration: if only JSON exists, read it and write YAML version
 *     - Original JSON preserved during migration (not deleted)
 *     - If both exist, YAML takes precedence (ignore JSON)
 *     - If neither exists, write YAML with defaults
 *     - All returned configs are normalized (validated types and values)
 *
 *   Properties:
 *     - Lazy migration: migration happens on first read, not proactively
 *     - Idempotent migration: safe to call multiple times (won't duplicate YAML)
 *     - Graceful degradation: malformed files return defaults with warning logged
 *     - File creation: ensures config directory exists before writing
 *
 *   Algorithm:
 *     1. Get YAML and JSON file paths
 *     2. Check if YAML exists:
 *        a. If YAML exists: read and parse YAML, normalize, return
 *        b. If YAML read/parse fails: log warning, continue to JSON
 *     3. If no valid YAML, check if JSON exists:
 *        a. If JSON exists: read and parse JSON, normalize
 *        b. Write normalized config to YAML (migration)
 *        c. Keep original JSON file
 *        d. Log info: "Configuration migrated from JSON to YAML format"
 *        e. Return normalized config
 *     4. If neither exists:
 *        a. Create config directory if needed
 *        b. Write defaultConfig to YAML
 *        c. Return defaultConfig
 *     5. On any error (filesystem, parse, etc.):
 *        a. Log warning with error details
 *        b. Return defaultConfig
 *
 *   Error Handling:
 *     - ENOENT (file not found): expected, handled gracefully
 *     - YAML parse error: log warning, try JSON fallback
 *     - JSON parse error: log warning, use defaults
 *     - Filesystem errors: log warning, use defaults
 *     - Never throws exceptions to caller
 *
 * Loads app config with YAML-first strategy and automatic migration.
 */
export function loadConfigYaml(defaultConfig: AppConfig): AppConfig {
  const paths = getConfigFilePaths();

  if (fs.existsSync(paths.yaml)) {
    try {
      const yamlContent = fs.readFileSync(paths.yaml, 'utf8');
      const result = parseYaml<any>(yamlContent);

      if (result.success && result.data) {
        return normalizeConfig(result.data);
      } else {
        log('warn', `Failed to parse YAML config: ${result.error?.message || 'unknown error'}`);
      }
    } catch (error) {
      log('warn', `Failed to read YAML config: ${String(error)}`);
    }
  }

  if (fs.existsSync(paths.json)) {
    try {
      const jsonContent = fs.readFileSync(paths.json, 'utf8');
      const parsed = JSON.parse(jsonContent);
      const normalized = normalizeConfig(parsed);

      try {
        const dataPath = getUserDataPath();
        fs.mkdirSync(dataPath, { recursive: true, mode: 0o755 });
        const yamlContent = buildAppConfigYaml(normalized);
        fs.writeFileSync(paths.yaml, yamlContent, { mode: 0o600 });
        log('info', 'Configuration migrated from JSON to YAML format');
      } catch (writeError) {
        log('warn', `Failed to write YAML during migration: ${String(writeError)}`);
      }

      return normalized;
    } catch (error) {
      log('warn', `Failed to read JSON config: ${String(error)}`);
      return defaultConfig;
    }
  }

  try {
    const dataPath = getUserDataPath();
    fs.mkdirSync(dataPath, { recursive: true, mode: 0o755 });
    const yamlContent = buildAppConfigYaml(defaultConfig);
    fs.writeFileSync(paths.yaml, yamlContent, { mode: 0o600 });
    return defaultConfig;
  } catch (error) {
    log('warn', `Failed to write default config: ${String(error)}`);
    return defaultConfig;
  }
}

export function normalizeConfig(raw: any): AppConfig {
  const logLevel: 'debug' | 'info' | 'warn' | 'error' = ['debug', 'info', 'warn', 'error'].includes(raw?.logLevel)
    ? raw.logLevel
    : 'info';

  const autoCheckInterval: 'never' | '1h' | '2h' | '4h' | '12h' | '24h' = ['1h', '2h', '4h', '12h', '24h', 'never'].includes(raw?.autoCheckInterval)
    ? raw.autoCheckInterval
    : '1h';

  const messagePollingInterval: '10s' | '30s' | '1m' | '5m' | 'disabled' = ['10s', '30s', '1m', '5m', 'disabled'].includes(raw?.messagePollingInterval)
    ? raw.messagePollingInterval
    : '10s';

  return {
    autoUpdate: typeof raw?.autoUpdate === 'boolean' ? raw.autoUpdate : true,
    logLevel,
    autoCheckInterval,
    messagePollingInterval,
    autoUpdateBehavior: ['manual', 'auto-download'].includes(raw?.autoUpdateBehavior)
      ? raw.autoUpdateBehavior
      : undefined,
    logRetentionDays: typeof raw?.logRetentionDays === 'number' ? raw.logRetentionDays : undefined,
    logMaxFileSizeMB: typeof raw?.logMaxFileSizeMB === 'number' ? raw.logMaxFileSizeMB : undefined,
    forceDevUpdateConfig: typeof raw?.forceDevUpdateConfig === 'boolean' ? raw.forceDevUpdateConfig : undefined,
    devUpdateSource: typeof raw?.devUpdateSource === 'string' && raw.devUpdateSource.trim().length > 0 ? raw.devUpdateSource : undefined,
    allowPrerelease: typeof raw?.allowPrerelease === 'boolean' ? raw.allowPrerelease : undefined,
  };
}

/**
 * saveConfigYaml(config: AppConfig, normalizedConfig: AppConfig): void
 *
 * CONTRACT:
 *   Inputs:
 *     - config: Partial<AppConfig>, user-provided config values to save
 *     - normalizedConfig: AppConfig, fully normalized and validated config to persist
 *
 *   Outputs:
 *     - void (side effects: writes to filesystem)
 *
 *   Invariants:
 *     - Always writes to YAML (primary format)
 *     - If JSON file exists, also writes to JSON (dual-write for downgrade safety)
 *     - If only YAML exists, only writes YAML
 *     - YAML file includes helpful comments (buildAppConfigYaml)
 *     - JSON file has no comments (standard JSON.stringify)
 *     - Config directory created if doesn't exist
 *     - Uses atomic writes: write to .tmp then rename
 *     - On error: logs error but doesn't throw
 *
 *   Properties:
 *     - Dual-write safety: users can downgrade to older version that only reads JSON
 *     - Comment preservation: YAML always has comments (regenerated on each write)
 *     - Atomic: readers never see partial writes
 *     - Directory creation: ensures parent directory exists
 *
 *   Algorithm:
 *     1. Get YAML and JSON file paths
 *     2. Create config directory if needed (recursive, mode 0o755)
 *     3. Write YAML file:
 *        a. Build YAML with comments using buildAppConfigYaml(normalizedConfig)
 *        b. Write to {yaml}.tmp with mode 0o600
 *        c. Rename {yaml}.tmp to {yaml} (atomic)
 *     4. Check if JSON file exists:
 *        a. If JSON exists: write to JSON (dual-write)
 *           i. Stringify normalizedConfig with 2-space indent
 *           ii. Write to {json}.tmp with mode 0o600
 *           iii. Rename {json}.tmp to {json} (atomic)
 *        b. If JSON doesn't exist: skip JSON write
 *     5. Log info: "Configuration saved"
 *     6. On error:
 *        a. Log error with details
 *        b. Don't throw (graceful degradation)
 *
 *   Error Handling:
 *     - Directory creation failure: log error, don't write files
 *     - YAML write failure: log error, skip JSON write
 *     - JSON write failure: log error, YAML already written (partial success)
 *     - Never throws to caller
 *
 * Saves app config with dual-write support during transition period.
 */
export function saveConfigYaml(config: Partial<AppConfig>, normalizedConfig: AppConfig): void {
  const paths = getConfigFilePaths();

  try {
    const dataPath = getUserDataPath();
    fs.mkdirSync(dataPath, { recursive: true, mode: 0o755 });

    const yamlContent = buildAppConfigYaml(normalizedConfig);
    const yamlTmpPath = `${paths.yaml}.tmp`;
    fs.writeFileSync(yamlTmpPath, yamlContent, { mode: 0o600 });
    fs.renameSync(yamlTmpPath, paths.yaml);

    if (fs.existsSync(paths.json)) {
      try {
        const jsonContent = JSON.stringify(normalizedConfig, null, 2);
        const jsonTmpPath = `${paths.json}.tmp`;
        fs.writeFileSync(jsonTmpPath, jsonContent, { mode: 0o600 });
        fs.renameSync(jsonTmpPath, paths.json);
      } catch (jsonError) {
        log('error', `Failed to write JSON config (dual-write): ${String(jsonError)}`);
      }
    }

    log('info', 'Configuration saved');
  } catch (error) {
    log('error', `Failed to save config: ${String(error)}`);
  }
}
