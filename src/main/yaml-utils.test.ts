import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import {
  parseYaml,
  stringifyYaml,
  buildAppConfigYaml,
  buildRelayConfigYaml,
  logDeprecationWarning,
} from './yaml-utils';
import YAML from 'yaml';

// Mock logging module
jest.mock('./logging', () => ({
  log: jest.fn(),
}));

import { log } from './logging';
const mockLog = log as jest.MockedFunction<typeof log>;

describe('yaml-utils', () => {
  beforeEach(() => {
    mockLog.mockClear();
  });

  describe('parseYaml', () => {
    it('parses valid YAML object', () => {
      const yaml = 'foo: bar\nbaz: 42';
      const result = parseYaml<any>(yaml);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ foo: 'bar', baz: 42 });
      expect(result.error).toBeUndefined();
    });

    it('parses valid YAML array', () => {
      const yaml = '- item1\n- item2\n- item3';
      const result = parseYaml<string[]>(yaml);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(['item1', 'item2', 'item3']);
      expect(result.error).toBeUndefined();
    });

    it('parses empty string as null', () => {
      const result = parseYaml<any>('');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      expect(result.error).toBeUndefined();
    });

    it('handles malformed YAML', () => {
      const yaml = 'foo: bar\n  baz: invalid indentation';
      const result = parseYaml<any>(yaml);

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeInstanceOf(Error);
    });

    it('handles YAML with comments', () => {
      const yaml = '# This is a comment\nfoo: bar  # inline comment\nbaz: 42';
      const result = parseYaml<any>(yaml);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ foo: 'bar', baz: 42 });
    });

    it('preserves boolean values', () => {
      const yaml = 'enabled: true\ndisabled: false';
      const result = parseYaml<any>(yaml);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ enabled: true, disabled: false });
    });

    it('preserves numeric precision', () => {
      const yaml = 'integer: 42\nfloat: 3.14159\nnegative: -123';
      const result = parseYaml<any>(yaml);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ integer: 42, float: 3.14159, negative: -123 });
    });

    it('never throws, always returns result', () => {
      const invalidInputs = [
        'foo: [unclosed array',
        'foo: "unclosed string',
        'foo:\n  - bar\n - baz',  // Invalid indentation
      ];

      invalidInputs.forEach(input => {
        expect(() => parseYaml(input)).not.toThrow();
        const result = parseYaml(input);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('stringifyYaml', () => {
    it('stringifies simple object', () => {
      const obj = { foo: 'bar', baz: 42 };
      const yaml = stringifyYaml(obj);

      expect(yaml).toContain('foo: bar');
      expect(yaml).toContain('baz: 42');

      // Verify round-trip
      const parsed = YAML.parse(yaml);
      expect(parsed).toEqual(obj);
    });

    it('stringifies array', () => {
      const arr = ['item1', 'item2', 'item3'];
      const yaml = stringifyYaml(arr);

      expect(yaml).toContain('- item1');
      expect(yaml).toContain('- item2');
      expect(yaml).toContain('- item3');

      const parsed = YAML.parse(yaml);
      expect(parsed).toEqual(arr);
    });

    it('preserves boolean values', () => {
      const obj = { enabled: true, disabled: false };
      const yaml = stringifyYaml(obj);

      expect(yaml).toContain('enabled: true');
      expect(yaml).toContain('disabled: false');
      expect(yaml).not.toContain('"true"');
      expect(yaml).not.toContain('"false"');

      const parsed = YAML.parse(yaml);
      expect(parsed.enabled).toBe(true);
      expect(parsed.disabled).toBe(false);
    });

    it('preserves numeric precision', () => {
      const obj = { integer: 42, float: 3.14159, negative: -123 };
      const yaml = stringifyYaml(obj);

      const parsed = YAML.parse(yaml);
      expect(parsed).toEqual(obj);
    });

    it('uses specified indent', () => {
      const obj = { parent: { child: 'value' } };
      const yaml = stringifyYaml(obj, { indent: 4 });

      expect(yaml).toContain('    child: value');
    });

    it('omits undefined fields', () => {
      const obj = { foo: undefined, bar: 'value' };
      const yaml = stringifyYaml(obj);

      const parsed = YAML.parse(yaml);
      expect(parsed.foo).toBeUndefined();
      expect(parsed.bar).toBe('value');
    });

    it('is deterministic', () => {
      const obj = { foo: 'bar', baz: 42, nested: { x: 1, y: 2 } };
      const yaml1 = stringifyYaml(obj);
      const yaml2 = stringifyYaml(obj);

      expect(yaml1).toBe(yaml2);
    });
  });

  describe('buildAppConfigYaml', () => {
    it('builds YAML with all required fields', () => {
      const config = {
        autoUpdate: true,
        logLevel: 'info',
      };
      const yaml = buildAppConfigYaml(config);

      expect(yaml).toContain('# Nostling Application Configuration');
      expect(yaml).toContain('# Enable automatic updates');
      expect(yaml).toContain('autoUpdate: true');
      expect(yaml).toContain('# Log level: debug, info, warn, or error');
      expect(yaml).toContain('logLevel: info');

      // Verify it's valid YAML
      const parsed = YAML.parse(yaml);
      expect(parsed.autoUpdate).toBe(true);
      expect(parsed.logLevel).toBe('info');
    });

    it('includes optional fields when defined', () => {
      const config = {
        autoUpdate: true,
        logLevel: 'debug',
        autoUpdateBehavior: 'manual',
        autoCheckInterval: '2h',
        messagePollingInterval: '30s',
        logRetentionDays: 7,
        logMaxFileSizeMB: 10,
      };
      const yaml = buildAppConfigYaml(config);

      expect(yaml).toContain('autoUpdateBehavior: manual');
      expect(yaml).toContain('autoCheckInterval: 2h');
      expect(yaml).toContain('messagePollingInterval: 30s');
      expect(yaml).toContain('logRetentionDays: 7');
      expect(yaml).toContain('logMaxFileSizeMB: 10');

      const parsed = YAML.parse(yaml);
      expect(parsed).toMatchObject(config);
    });

    it('includes dev mode fields when defined', () => {
      const config = {
        autoUpdate: false,
        logLevel: 'debug',
        forceDevUpdateConfig: true,
        devUpdateSource: 'file:///path/to/updates',
        allowPrerelease: true,
      };
      const yaml = buildAppConfigYaml(config);

      expect(yaml).toContain('[Dev mode]');
      expect(yaml).toContain('forceDevUpdateConfig: true');
      expect(yaml).toContain('devUpdateSource: file:///path/to/updates');
      expect(yaml).toContain('allowPrerelease: true');

      const parsed = YAML.parse(yaml);
      expect(parsed.forceDevUpdateConfig).toBe(true);
      expect(parsed.devUpdateSource).toBe('file:///path/to/updates');
      expect(parsed.allowPrerelease).toBe(true);
    });

    it('omits undefined optional fields', () => {
      const config = {
        autoUpdate: true,
        logLevel: 'info',
        autoCheckInterval: '1h',
        // Other optional fields undefined
      };
      const yaml = buildAppConfigYaml(config);

      expect(yaml).toContain('autoCheckInterval: 1h');
      expect(yaml).not.toContain('autoUpdateBehavior');
      expect(yaml).not.toContain('messagePollingInterval');
      expect(yaml).not.toContain('logRetentionDays');
      expect(yaml).not.toContain('forceDevUpdateConfig');
    });

    it('includes helpful comments for each field', () => {
      const config = {
        autoUpdate: true,
        logLevel: 'info',
        autoCheckInterval: '1h',
        messagePollingInterval: '10s',
        autoUpdateBehavior: 'manual'
      };
      const yaml = buildAppConfigYaml(config);

      // Check comments explain valid values
      expect(yaml).toContain('debug, info, warn, or error');
      expect(yaml).toContain('1h, 2h, 4h, 12h, 24h, or never');
      expect(yaml).toContain('10s, 30s, 1m, 5m, or disabled');
      expect(yaml).toContain('manual or auto-download');
    });

    it('preserves boolean false values', () => {
      const config = {
        autoUpdate: false,
        logLevel: 'error',
      };
      const yaml = buildAppConfigYaml(config);

      expect(yaml).toContain('autoUpdate: false');

      const parsed = YAML.parse(yaml);
      expect(parsed.autoUpdate).toBe(false);
    });

    it('round-trips correctly', () => {
      const config = {
        autoUpdate: true,
        logLevel: 'debug',
        autoCheckInterval: '4h',
        messagePollingInterval: '1m',
        logRetentionDays: 14,
      };
      const yaml = buildAppConfigYaml(config);
      const parsed = YAML.parse(yaml);

      expect(parsed).toMatchObject(config);
    });
  });

  describe('buildRelayConfigYaml', () => {
    it('builds YAML array with header comment', () => {
      const relays = [
        { url: 'wss://relay1.example.com', read: true, write: true, order: 0 },
        { url: 'wss://relay2.example.com', read: true, write: false, order: 1 },
      ];
      const yaml = buildRelayConfigYaml(relays);

      expect(yaml).toContain('# Relay Configuration (YAML format)');
      expect(yaml).toContain('# Each relay has:');
      expect(yaml).toContain('#   url: relay WebSocket URL');
      expect(yaml).toContain('#   read: whether to read events');
      expect(yaml).toContain('#   write: whether to write events');
      expect(yaml).toContain('#   order: priority order');

      expect(yaml).toContain('wss://relay1.example.com');
      expect(yaml).toContain('wss://relay2.example.com');

      const parsed = YAML.parse(yaml);
      expect(parsed).toEqual(relays);
    });

    it('handles empty array', () => {
      const relays: any[] = [];
      const yaml = buildRelayConfigYaml(relays);

      expect(yaml).toContain('# Relay Configuration');

      const parsed = YAML.parse(yaml);
      expect(parsed).toEqual([]);
    });

    it('preserves relay order', () => {
      const relays = [
        { url: 'wss://relay3.example.com', read: true, write: true, order: 2 },
        { url: 'wss://relay1.example.com', read: true, write: true, order: 0 },
        { url: 'wss://relay2.example.com', read: true, write: true, order: 1 },
      ];
      const yaml = buildRelayConfigYaml(relays);

      const parsed = YAML.parse(yaml);
      expect(parsed).toEqual(relays);
      expect(parsed[0].url).toBe('wss://relay3.example.com');
      expect(parsed[1].url).toBe('wss://relay1.example.com');
      expect(parsed[2].url).toBe('wss://relay2.example.com');
    });

    it('preserves boolean read/write values', () => {
      const relays = [
        { url: 'wss://relay.example.com', read: false, write: true, order: 0 },
      ];
      const yaml = buildRelayConfigYaml(relays);

      const parsed = YAML.parse(yaml);
      expect(parsed[0].read).toBe(false);
      expect(parsed[0].write).toBe(true);
    });

    it('round-trips correctly', () => {
      const relays = [
        { url: 'wss://relay1.example.com', read: true, write: true, order: 0 },
        { url: 'wss://relay2.example.com', read: false, write: true, order: 1 },
        { url: 'wss://relay3.example.com', read: true, write: false, order: 2 },
      ];
      const yaml = buildRelayConfigYaml(relays);
      const parsed = YAML.parse(yaml);

      expect(parsed).toEqual(relays);
    });
  });

  describe('logDeprecationWarning', () => {
    it('logs app config deprecation warning', () => {
      logDeprecationWarning('app');

      expect(mockLog).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('Config file exists in both YAML and JSON formats')
      );
      expect(mockLog).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('The JSON format is deprecated')
      );
      expect(mockLog).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('You can safely remove config.json')
      );
      expect(mockLog).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('auto-removed in the next major version')
      );
    });

    it('logs relay config deprecation warning with identity ID', () => {
      logDeprecationWarning('relay', 'abc123');

      expect(mockLog).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('Relay config for identity abc123')
      );
      expect(mockLog).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('exists in both YAML and JSON formats')
      );
      expect(mockLog).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('You can safely remove relays.json')
      );
    });

    it('logs at info level, not warn', () => {
      logDeprecationWarning('app');

      expect(mockLog).toHaveBeenCalledWith('info', expect.any(String));
      expect(mockLog).not.toHaveBeenCalledWith('warn', expect.any(String));
    });

    it('is idempotent - safe to call multiple times', () => {
      logDeprecationWarning('app');
      logDeprecationWarning('app');
      logDeprecationWarning('app');

      // Should log each time (orchestrator decides when to call)
      expect(mockLog).toHaveBeenCalledTimes(3);
    });

    it('handles missing identity ID for relay config', () => {
      logDeprecationWarning('relay');

      expect(mockLog).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('identity unknown')
      );
    });
  });

  describe('property-based tests', () => {
    it('parseYaml never throws on arbitrary strings', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          expect(() => parseYaml(input)).not.toThrow();
        })
      );
    });

    it('stringifyYaml produces valid YAML for arbitrary objects', () => {
      fc.assert(
        fc.property(
          fc.record({
            str: fc.string(),
            num: fc.integer(),
            bool: fc.boolean(),
          }),
          (obj) => {
            const yaml = stringifyYaml(obj);
            const parsed = YAML.parse(yaml);
            expect(parsed.str).toBe(obj.str);
            expect(parsed.num).toBe(obj.num);
            expect(parsed.bool).toBe(obj.bool);
          }
        )
      );
    });

    it('round-trip: parse(stringify(obj)) equals obj', () => {
      fc.assert(
        fc.property(
          fc.record({
            autoUpdate: fc.boolean(),
            logLevel: fc.constantFrom('debug', 'info', 'warn', 'error'),
            autoCheckInterval: fc.constantFrom('1h', '2h', '4h', '12h', '24h', 'never'),
          }),
          (config) => {
            const yaml = stringifyYaml(config);
            const result = parseYaml(yaml);
            expect(result.success).toBe(true);
            expect(result.data).toEqual(config);
          }
        )
      );
    });

    it('buildAppConfigYaml produces parseable YAML', () => {
      fc.assert(
        fc.property(
          fc.record({
            autoUpdate: fc.boolean(),
            logLevel: fc.constantFrom('debug', 'info', 'warn', 'error'),
          }),
          (config) => {
            const yaml = buildAppConfigYaml(config);
            const result = parseYaml(yaml);
            expect(result.success).toBe(true);
            expect(result.data).toMatchObject(config);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('buildRelayConfigYaml preserves relay structure', () => {
      const relayArb = fc.record({
        url: fc.webUrl({ validSchemes: ['wss'] }),
        read: fc.boolean(),
        write: fc.boolean(),
        order: fc.nat(100),
      });

      fc.assert(
        fc.property(fc.array(relayArb, { minLength: 0, maxLength: 10 }), (relays) => {
          const yaml = buildRelayConfigYaml(relays);
          const result = parseYaml(yaml);
          expect(result.success).toBe(true);
          expect(result.data).toEqual(relays);
        }),
        { numRuns: 100 }
      );
    });
  });
});
