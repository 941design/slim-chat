import YAML from 'yaml';
import { log } from './logging';

/**
 * YAML Utilities for Config Format Migration
 *
 * Provides shared utilities for parsing and stringifying YAML config files
 * with error handling and comment preservation.
 */

export interface YamlParseResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

/**
 * parseYaml<T>(content: string): YamlParseResult<T>
 *
 * CONTRACT:
 *   Inputs:
 *     - content: string, YAML content to parse
 *
 *   Outputs:
 *     - YamlParseResult<T>: object with success flag, data (if successful), error (if failed)
 *       success case: { success: true, data: parsed_object, error: undefined }
 *       failure case: { success: false, data: undefined, error: Error_object }
 *
 *   Invariants:
 *     - Exactly one of data or error is defined (never both, never neither)
 *     - Empty string input is valid YAML (parses to null)
 *     - Malformed YAML returns success: false with YAMLParseError
 *
 *   Properties:
 *     - Round-trip: for valid YAML, parse(stringify(obj)) deep-equals obj (modulo comments)
 *     - Error safety: never throws, always returns result object
 *     - Type preservation: parsed data matches expected type T (caller validates)
 *
 * Parses YAML content with error handling.
 * Returns structured result instead of throwing.
 */
export function parseYaml<T>(content: string): YamlParseResult<T> {
  try {
    const data = YAML.parse(content) as T;
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * stringifyYaml(data: any, options?: YamlStringifyOptions): string
 *
 * CONTRACT:
 *   Inputs:
 *     - data: any, JavaScript object to serialize to YAML
 *     - options: optional YamlStringifyOptions
 *       * indent: number, spaces per indentation level (default: 2)
 *       * lineWidth: number, max line width before wrapping (default: 80)
 *
 *   Outputs:
 *     - string: YAML-formatted text representation of data
 *
 *   Invariants:
 *     - Output is valid YAML that parses back to equivalent object
 *     - undefined values are omitted from output
 *     - Boolean true/false preserved (not "true"/"false" strings)
 *     - Numbers preserved with full precision
 *     - Arrays and objects maintain structure
 *
 *   Properties:
 *     - Idempotent: stringify(parse(yaml)) produces equivalent YAML (modulo formatting)
 *     - Deterministic: same input produces same output (no randomness)
 *     - Human-readable: uses readable YAML syntax, not JSON-style
 *
 * Converts JavaScript object to YAML string.
 */
export interface YamlStringifyOptions {
  indent?: number;
  lineWidth?: number;
}

export function stringifyYaml(data: any, options?: YamlStringifyOptions): string {
  return YAML.stringify(data, {
    indent: options?.indent ?? 2,
    lineWidth: options?.lineWidth ?? 80,
  });
}

/**
 * buildAppConfigYaml(config: any): string
 *
 * CONTRACT:
 *   Inputs:
 *     - config: AppConfig object to serialize
 *
 *   Outputs:
 *     - string: YAML text with inline comments explaining each field
 *
 *   Invariants:
 *     - Output includes comment for every config field
 *     - Comments appear before their corresponding field
 *     - Comments explain valid values and purpose
 *     - Output is valid YAML (can be parsed back)
 *
 *   Properties:
 *     - Self-documenting: users can understand config without external docs
 *     - Preserves structure: parse(buildAppConfigYaml(cfg)) deep-equals cfg (modulo optional fields)
 *     - Backward compatible: same fields as JSON format, just different serialization
 *
 *   Algorithm:
 *     1. Build YAML string manually with inline comments
 *     2. For each AppConfig field:
 *        a. Write comment line explaining the field
 *        b. Write field: value line
 *     3. Only include optional fields if they are defined
 *     4. Use descriptive comments referencing valid enum values
 *
 * Builds YAML config with helpful inline comments.
 * This is for app config (config.yaml).
 */
export function buildAppConfigYaml(config: any): string {
  const lines: string[] = [];

  lines.push('# Nostling Application Configuration (YAML format)');
  lines.push('');
  lines.push('# Enable automatic updates');
  lines.push(`autoUpdate: ${config.autoUpdate}`);
  lines.push('');
  lines.push('# Log level: debug, info, warn, or error');
  lines.push(`logLevel: ${config.logLevel}`);

  if (config.autoUpdateBehavior !== undefined) {
    lines.push('');
    lines.push('# Auto-update behavior: manual or auto-download');
    lines.push(`autoUpdateBehavior: ${config.autoUpdateBehavior}`);
  }

  if (config.autoCheckInterval !== undefined) {
    lines.push('');
    lines.push('# How often to check for updates: 1h, 2h, 4h, 12h, 24h, or never');
    lines.push(`autoCheckInterval: ${config.autoCheckInterval}`);
  }

  if (config.messagePollingInterval !== undefined) {
    lines.push('');
    lines.push('# Message polling interval: 10s, 30s, 1m, 5m, or disabled');
    lines.push(`messagePollingInterval: ${config.messagePollingInterval}`);
  }

  if (config.logRetentionDays !== undefined) {
    lines.push('');
    lines.push('# Number of days to retain log files');
    lines.push(`logRetentionDays: ${config.logRetentionDays}`);
  }

  if (config.logMaxFileSizeMB !== undefined) {
    lines.push('');
    lines.push('# Maximum log file size in megabytes');
    lines.push(`logMaxFileSizeMB: ${config.logMaxFileSizeMB}`);
  }

  if (config.forceDevUpdateConfig !== undefined) {
    lines.push('');
    lines.push('# [Dev mode] Force update checks in unpacked app');
    lines.push(`forceDevUpdateConfig: ${config.forceDevUpdateConfig}`);
  }

  if (config.devUpdateSource !== undefined) {
    lines.push('');
    lines.push('# [Dev mode] Custom update source (GitHub URL or local file://)');
    lines.push(`devUpdateSource: ${config.devUpdateSource}`);
  }

  if (config.allowPrerelease !== undefined) {
    lines.push('');
    lines.push('# [Dev mode] Allow pre-release versions');
    lines.push(`allowPrerelease: ${config.allowPrerelease}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * buildRelayConfigYaml(relays: any[]): string
 *
 * CONTRACT:
 *   Inputs:
 *     - relays: array of NostlingRelayEndpoint objects
 *
 *   Outputs:
 *     - string: YAML text with header comment explaining relay config format
 *
 *   Invariants:
 *     - Output is valid YAML array
 *     - Each relay has url, read, write, order fields
 *     - Output includes header comment explaining format
 *     - parse(buildRelayConfigYaml(relays)) deep-equals relays
 *
 *   Properties:
 *     - Self-documenting: header explains relay config structure
 *     - Backward compatible: same structure as JSON, different serialization
 *     - Preserves order: relays appear in same order as input array
 *
 * Builds relay config YAML with header comment.
 * This is for per-identity relay configs (identities/<id>/relays.yaml).
 */
export function buildRelayConfigYaml(relays: any[]): string {
  const header = [
    '# Relay Configuration (YAML format)',
    '# Each relay has:',
    '#   url: relay WebSocket URL (wss://...)',
    '#   read: whether to read events from this relay (true/false)',
    '#   write: whether to write events to this relay (true/false)',
    '#   order: priority order (lower numbers first)',
    '',
  ].join('\n');

  return header + stringifyYaml(relays);
}

/**
 * logDeprecationWarning(configType: 'app' | 'relay', identityId?: string): void
 *
 * CONTRACT:
 *   Inputs:
 *     - configType: either 'app' or 'relay', indicates which config type
 *     - identityId: optional string, required when configType is 'relay'
 *
 *   Outputs:
 *     - void (side effect: logs info message)
 *
 *   Invariants:
 *     - Logs at 'info' level (not 'warn' to avoid alarming users)
 *     - Message mentions both formats exist
 *     - Message explains JSON is deprecated
 *     - Message tells user they can safely remove JSON file
 *     - Message mentions auto-removal in next major version
 *
 *   Properties:
 *     - Idempotent: safe to call multiple times
 *     - User-friendly: provides clear guidance, not just a warning
 *     - Forward-compatible: explains future behavior
 *
 * Logs deprecation warning when both YAML and JSON configs exist.
 */
export function logDeprecationWarning(configType: 'app' | 'relay', identityId?: string): void {
  if (configType === 'app') {
    log('info',
      'Config file exists in both YAML and JSON formats. ' +
      'The JSON format is deprecated. ' +
      'You can safely remove config.json - it will be auto-removed in the next major version.'
    );
  } else {
    const id = identityId ?? 'unknown';
    log('info',
      `Relay config for identity ${id} exists in both YAML and JSON formats. ` +
      'The JSON format is deprecated. ' +
      `You can safely remove relays.json - it will be auto-removed in the next major version.`
    );
  }
}
