import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getConfigFilePaths,
  checkForDualFormat,
  loadConfigYaml,
  saveConfigYaml,
} from './config-yaml-migration';
import { AppConfig } from '../shared/types';

jest.mock('./logging', () => ({
  log: jest.fn(),
}));

jest.mock('./paths', () => ({
  getUserDataPath: jest.fn(),
}));

import { log } from './logging';
import { getUserDataPath } from './paths';

const mockLog = log as jest.MockedFunction<typeof log>;
const mockGetUserDataPath = getUserDataPath as jest.MockedFunction<typeof getUserDataPath>;

describe('config-yaml-migration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nostling-config-test-'));
    mockGetUserDataPath.mockReturnValue(testDir);
    mockLog.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockGetUserDataPath.mockReturnValue(testDir);
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  const DEFAULT_CONFIG: AppConfig = {
    autoUpdate: true,
    logLevel: 'info',
    autoCheckInterval: '1h',
    messagePollingInterval: '10s',
  };

  describe('getConfigFilePaths', () => {
    it('returns absolute paths in same directory', () => {
      const paths = getConfigFilePaths();

      expect(path.isAbsolute(paths.yaml)).toBe(true);
      expect(path.isAbsolute(paths.json)).toBe(true);
      expect(path.dirname(paths.yaml)).toBe(path.dirname(paths.json));
    });

    it('yaml path ends with config.yaml', () => {
      const paths = getConfigFilePaths();
      expect(paths.yaml.endsWith('config.yaml')).toBe(true);
    });

    it('json path ends with config.json', () => {
      const paths = getConfigFilePaths();
      expect(paths.json.endsWith('config.json')).toBe(true);
    });

    it('is deterministic', () => {
      const paths1 = getConfigFilePaths();
      const paths2 = getConfigFilePaths();
      expect(paths1).toEqual(paths2);
    });
  });

  describe('checkForDualFormat', () => {
    it('returns false when neither file exists', () => {
      expect(checkForDualFormat()).toBe(false);
    });

    it('returns false when only YAML exists', () => {
      const paths = getConfigFilePaths();
      fs.writeFileSync(paths.yaml, 'autoUpdate: true\nlogLevel: info\n');
      expect(checkForDualFormat()).toBe(false);
    });

    it('returns false when only JSON exists', () => {
      const paths = getConfigFilePaths();
      fs.writeFileSync(paths.json, JSON.stringify(DEFAULT_CONFIG));
      expect(checkForDualFormat()).toBe(false);
    });

    it('returns true when both files exist', () => {
      const paths = getConfigFilePaths();
      fs.writeFileSync(paths.yaml, 'autoUpdate: true\nlogLevel: info\n');
      fs.writeFileSync(paths.json, JSON.stringify(DEFAULT_CONFIG));
      expect(checkForDualFormat()).toBe(true);
    });

    it('is idempotent', () => {
      const result1 = checkForDualFormat();
      const result2 = checkForDualFormat();
      const result3 = checkForDualFormat();
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });
  });

  describe('loadConfigYaml', () => {
    describe('Example-Based Tests', () => {
      it('loads valid YAML config', () => {
        const paths = getConfigFilePaths();
        const yamlContent = 'autoUpdate: false\nlogLevel: debug\nautoCheckInterval: 2h\nmessagePollingInterval: 30s\n';
        fs.writeFileSync(paths.yaml, yamlContent);

        const config = loadConfigYaml(DEFAULT_CONFIG);

        expect(config.autoUpdate).toBe(false);
        expect(config.logLevel).toBe('debug');
        expect(config.autoCheckInterval).toBe('2h');
        expect(config.messagePollingInterval).toBe('30s');
      });

      it('migrates from JSON to YAML when only JSON exists', () => {
        const paths = getConfigFilePaths();
        const jsonConfig = {
          autoUpdate: false,
          logLevel: 'warn',
          autoCheckInterval: '4h',
          messagePollingInterval: '1m',
        };
        fs.writeFileSync(paths.json, JSON.stringify(jsonConfig));

        const config = loadConfigYaml(DEFAULT_CONFIG);

        expect(config.autoUpdate).toBe(false);
        expect(config.logLevel).toBe('warn');
        expect(fs.existsSync(paths.yaml)).toBe(true);
        expect(fs.existsSync(paths.json)).toBe(true);
        expect(mockLog).toHaveBeenCalledWith('info', 'Configuration migrated from JSON to YAML format');
      });

      it('creates YAML with defaults when neither file exists', () => {
        const paths = getConfigFilePaths();

        const config = loadConfigYaml(DEFAULT_CONFIG);

        expect(config).toEqual(DEFAULT_CONFIG);
        expect(fs.existsSync(paths.yaml)).toBe(true);
        expect(fs.existsSync(paths.json)).toBe(false);
      });

      it('YAML takes precedence over JSON when both exist', () => {
        const paths = getConfigFilePaths();
        const yamlContent = 'autoUpdate: false\nlogLevel: debug\nautoCheckInterval: 2h\nmessagePollingInterval: 30s\n';
        const jsonConfig = { autoUpdate: true, logLevel: 'info', autoCheckInterval: '1h', messagePollingInterval: '10s' };
        fs.writeFileSync(paths.yaml, yamlContent);
        fs.writeFileSync(paths.json, JSON.stringify(jsonConfig));

        const config = loadConfigYaml(DEFAULT_CONFIG);

        expect(config.autoUpdate).toBe(false);
        expect(config.logLevel).toBe('debug');
      });

      it('falls back to defaults on malformed YAML', () => {
        const paths = getConfigFilePaths();
        fs.writeFileSync(paths.yaml, 'invalid: [unclosed array');

        const config = loadConfigYaml(DEFAULT_CONFIG);

        expect(config).toEqual(DEFAULT_CONFIG);
        expect(mockLog).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to parse YAML config'));
      });

      it('falls back to defaults on malformed JSON', () => {
        const paths = getConfigFilePaths();
        fs.writeFileSync(paths.json, '{invalid json');

        const config = loadConfigYaml(DEFAULT_CONFIG);

        expect(config).toEqual(DEFAULT_CONFIG);
        expect(mockLog).toHaveBeenCalledWith('warn', expect.stringContaining('Failed to read JSON config'));
      });

      it('preserves original JSON during migration', () => {
        const paths = getConfigFilePaths();
        const jsonConfig = { autoUpdate: false, logLevel: 'error', autoCheckInterval: '12h', messagePollingInterval: '5m' };
        const jsonContent = JSON.stringify(jsonConfig);
        fs.writeFileSync(paths.json, jsonContent);

        loadConfigYaml(DEFAULT_CONFIG);

        expect(fs.existsSync(paths.json)).toBe(true);
        const preserved = fs.readFileSync(paths.json, 'utf8');
        expect(preserved).toBe(jsonContent);
      });

      it('normalizes config values', () => {
        const paths = getConfigFilePaths();
        const yamlContent = 'autoUpdate: true\nlogLevel: invalid\nautoCheckInterval: invalid\nmessagePollingInterval: invalid\n';
        fs.writeFileSync(paths.yaml, yamlContent);

        const config = loadConfigYaml(DEFAULT_CONFIG);

        expect(config.logLevel).toBe('info');
        expect(config.autoCheckInterval).toBe('1h');
        expect(config.messagePollingInterval).toBe('10s');
      });

      it('handles optional fields', () => {
        const paths = getConfigFilePaths();
        const yamlContent = `autoUpdate: true
logLevel: info
autoCheckInterval: 1h
messagePollingInterval: 10s
autoUpdateBehavior: manual
logRetentionDays: 30
logMaxFileSizeMB: 100
forceDevUpdateConfig: true
devUpdateSource: file:///test
allowPrerelease: false
`;
        fs.writeFileSync(paths.yaml, yamlContent);

        const config = loadConfigYaml(DEFAULT_CONFIG);

        expect(config.autoUpdateBehavior).toBe('manual');
        expect(config.logRetentionDays).toBe(30);
        expect(config.logMaxFileSizeMB).toBe(100);
        expect(config.forceDevUpdateConfig).toBe(true);
        expect(config.devUpdateSource).toBe('file:///test');
        expect(config.allowPrerelease).toBe(false);
      });

      it('never throws on errors', () => {
        const paths = getConfigFilePaths();
        fs.writeFileSync(paths.yaml, 'invalid: [unclosed');

        expect(() => loadConfigYaml(DEFAULT_CONFIG)).not.toThrow();
      });
    });

    describe('Property-Based Tests', () => {
      const appConfigArb = fc.record({
        autoUpdate: fc.boolean(),
        logLevel: fc.constantFrom('debug', 'info', 'warn', 'error'),
        autoCheckInterval: fc.constantFrom('1h', '2h', '4h', '12h', '24h', 'never'),
        messagePollingInterval: fc.constantFrom('10s', '30s', '1m', '5m', 'disabled'),
        autoUpdateBehavior: fc.option(fc.constantFrom('manual', 'auto-download'), { nil: undefined }),
        logRetentionDays: fc.option(fc.integer({ min: 1, max: 365 }), { nil: undefined }),
        logMaxFileSizeMB: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
        forceDevUpdateConfig: fc.option(fc.boolean(), { nil: undefined }),
        devUpdateSource: fc.option(
          fc.oneof(
            fc.webUrl(),
            fc.string({ minLength: 1, maxLength: 50 }).map(s => `file://${s.replace(/[^a-zA-Z0-9_/.-]/g, '_')}`)
          ),
          { nil: undefined }
        ),
        allowPrerelease: fc.option(fc.boolean(), { nil: undefined }),
      });

      it('YAML-only: loads and round-trips config correctly', () => {
        fc.assert(
          fc.property(appConfigArb, (config) => {
            if (fs.existsSync(testDir)) {
              fs.rmSync(testDir, { recursive: true, force: true });
            }
            fs.mkdirSync(testDir, { recursive: true });
            const paths = getConfigFilePaths();

            saveConfigYaml(config, config);

            const loaded = loadConfigYaml(DEFAULT_CONFIG);

            expect(loaded).toEqual(config);
          }),
          { numRuns: 50 }
        );
      });

      it('JSON-only: migrates to YAML correctly', () => {
        fc.assert(
          fc.property(appConfigArb, (config) => {
            if (fs.existsSync(testDir)) {
              fs.rmSync(testDir, { recursive: true, force: true });
            }
            fs.mkdirSync(testDir, { recursive: true });
            const paths = getConfigFilePaths();
            fs.writeFileSync(paths.json, JSON.stringify(config));

            const loaded = loadConfigYaml(DEFAULT_CONFIG);

            expect(loaded.autoUpdate).toBe(config.autoUpdate);
            expect(loaded.logLevel).toBe(config.logLevel);
            expect(fs.existsSync(paths.yaml)).toBe(true);
            expect(fs.existsSync(paths.json)).toBe(true);
          }),
          { numRuns: 50 }
        );
      });

      it('YAML precedence: ignores JSON when both exist', () => {
        fc.assert(
          fc.property(appConfigArb, appConfigArb, (yamlConfig, jsonConfig) => {
            fc.pre(yamlConfig.autoUpdate !== jsonConfig.autoUpdate);

            if (fs.existsSync(testDir)) {
              fs.rmSync(testDir, { recursive: true, force: true });
            }
            fs.mkdirSync(testDir, { recursive: true });
            const paths = getConfigFilePaths();
            const yamlLines = [
              `autoUpdate: ${yamlConfig.autoUpdate}`,
              `logLevel: ${yamlConfig.logLevel}`,
              `autoCheckInterval: ${yamlConfig.autoCheckInterval}`,
              `messagePollingInterval: ${yamlConfig.messagePollingInterval}`,
            ];
            fs.writeFileSync(paths.yaml, yamlLines.join('\n') + '\n');
            fs.writeFileSync(paths.json, JSON.stringify(jsonConfig));

            const loaded = loadConfigYaml(DEFAULT_CONFIG);

            expect(loaded.autoUpdate).toBe(yamlConfig.autoUpdate);
            expect(loaded.logLevel).toBe(yamlConfig.logLevel);
          }),
          { numRuns: 30 }
        );
      });

      it('normalization: invalid values use defaults', () => {
        fc.assert(
          fc.property(
            fc.record({
              autoUpdate: fc.anything(),
              logLevel: fc.string(),
              autoCheckInterval: fc.string(),
              messagePollingInterval: fc.string(),
            }),
            (rawConfig) => {
              if (fs.existsSync(testDir)) {
                fs.rmSync(testDir, { recursive: true, force: true });
              }
              fs.mkdirSync(testDir, { recursive: true });
              const paths = getConfigFilePaths();
              fs.writeFileSync(paths.json, JSON.stringify(rawConfig));

              const loaded = loadConfigYaml(DEFAULT_CONFIG);

              expect(['debug', 'info', 'warn', 'error']).toContain(loaded.logLevel);
              expect(['1h', '2h', '4h', '12h', '24h', 'never']).toContain(loaded.autoCheckInterval);
              expect(['10s', '30s', '1m', '5m', 'disabled']).toContain(loaded.messagePollingInterval);
              expect(typeof loaded.autoUpdate).toBe('boolean');
            }
          ),
          { numRuns: 50 }
        );
      });

      it('idempotence: multiple loads return same config', () => {
        fc.assert(
          fc.property(appConfigArb, (config) => {
            if (fs.existsSync(testDir)) {
              fs.rmSync(testDir, { recursive: true, force: true });
            }
            fs.mkdirSync(testDir, { recursive: true });

            saveConfigYaml(config, config);

            const loaded1 = loadConfigYaml(DEFAULT_CONFIG);
            const loaded2 = loadConfigYaml(DEFAULT_CONFIG);
            const loaded3 = loadConfigYaml(DEFAULT_CONFIG);

            expect(loaded1).toEqual(loaded2);
            expect(loaded2).toEqual(loaded3);
            expect(loaded1).toEqual(config);
          }),
          { numRuns: 30 }
        );
      });
    });
  });

  describe('saveConfigYaml', () => {
    describe('Example-Based Tests', () => {
      it('saves config to YAML', () => {
        const config: AppConfig = {
          autoUpdate: false,
          logLevel: 'debug',
          autoCheckInterval: '2h',
          messagePollingInterval: '30s',
        };

        saveConfigYaml(config, config);

        const paths = getConfigFilePaths();
        expect(fs.existsSync(paths.yaml)).toBe(true);
        expect(mockLog).toHaveBeenCalledWith('info', 'Configuration saved');
      });

      it('uses atomic write with temp file', () => {
        const config: AppConfig = {
          autoUpdate: true,
          logLevel: 'info',
          autoCheckInterval: '1h',
          messagePollingInterval: '10s',
        };

        saveConfigYaml(config, config);

        const paths = getConfigFilePaths();
        expect(fs.existsSync(paths.yaml)).toBe(true);
        expect(fs.existsSync(`${paths.yaml}.tmp`)).toBe(false);
      });

      it('dual-writes to JSON if JSON exists', () => {
        const paths = getConfigFilePaths();
        fs.writeFileSync(paths.json, JSON.stringify(DEFAULT_CONFIG));

        const newConfig: AppConfig = {
          autoUpdate: false,
          logLevel: 'warn',
          autoCheckInterval: '4h',
          messagePollingInterval: '1m',
        };

        saveConfigYaml(newConfig, newConfig);

        expect(fs.existsSync(paths.yaml)).toBe(true);
        expect(fs.existsSync(paths.json)).toBe(true);

        const jsonContent = JSON.parse(fs.readFileSync(paths.json, 'utf8'));
        expect(jsonContent.autoUpdate).toBe(false);
        expect(jsonContent.logLevel).toBe('warn');
      });

      it('does not write JSON if JSON does not exist', () => {
        const config: AppConfig = {
          autoUpdate: true,
          logLevel: 'info',
          autoCheckInterval: '1h',
          messagePollingInterval: '10s',
        };

        saveConfigYaml(config, config);

        const paths = getConfigFilePaths();
        expect(fs.existsSync(paths.yaml)).toBe(true);
        expect(fs.existsSync(paths.json)).toBe(false);
      });

      it('creates directory if it does not exist', () => {
        fs.rmSync(testDir, { recursive: true, force: true });
        const config: AppConfig = {
          autoUpdate: true,
          logLevel: 'info',
          autoCheckInterval: '1h',
          messagePollingInterval: '10s',
        };

        saveConfigYaml(config, config);

        expect(fs.existsSync(testDir)).toBe(true);
        const paths = getConfigFilePaths();
        expect(fs.existsSync(paths.yaml)).toBe(true);
      });

      it('handles optional fields', () => {
        const config: AppConfig = {
          autoUpdate: true,
          logLevel: 'debug',
          autoCheckInterval: '2h',
          messagePollingInterval: '30s',
          autoUpdateBehavior: 'manual',
          logRetentionDays: 30,
          logMaxFileSizeMB: 100,
        };

        saveConfigYaml(config, config);

        const paths = getConfigFilePaths();
        const yamlContent = fs.readFileSync(paths.yaml, 'utf8');
        expect(yamlContent).toContain('autoUpdateBehavior: manual');
        expect(yamlContent).toContain('logRetentionDays: 30');
        expect(yamlContent).toContain('logMaxFileSizeMB: 100');
      });

      it('never throws on errors', () => {
        const config: AppConfig = DEFAULT_CONFIG;

        mockGetUserDataPath.mockReturnValue('/invalid/path/that/cannot/be/created/by/user');

        expect(() => saveConfigYaml(config, config)).not.toThrow();
        expect(mockLog).toHaveBeenCalledWith('error', expect.stringContaining('Failed to save config'));
      });
    });

    describe('Property-Based Tests', () => {
      const appConfigArb = fc.record({
        autoUpdate: fc.boolean(),
        logLevel: fc.constantFrom('debug', 'info', 'warn', 'error'),
        autoCheckInterval: fc.constantFrom('1h', '2h', '4h', '12h', '24h', 'never'),
        messagePollingInterval: fc.constantFrom('10s', '30s', '1m', '5m', 'disabled'),
        autoUpdateBehavior: fc.option(fc.constantFrom('manual', 'auto-download'), { nil: undefined }),
        logRetentionDays: fc.option(fc.integer({ min: 1, max: 365 }), { nil: undefined }),
        logMaxFileSizeMB: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
        forceDevUpdateConfig: fc.option(fc.boolean(), { nil: undefined }),
        devUpdateSource: fc.option(
          fc.oneof(
            fc.webUrl(),
            fc.string({ minLength: 1, maxLength: 50 }).map(s => `file://${s.replace(/[^a-zA-Z0-9_/.-]/g, '_')}`)
          ),
          { nil: undefined }
        ),
        allowPrerelease: fc.option(fc.boolean(), { nil: undefined }),
      });

      it('YAML-only mode: saves and loads correctly', () => {
        fc.assert(
          fc.property(appConfigArb, (config) => {
            if (fs.existsSync(testDir)) {
              fs.rmSync(testDir, { recursive: true, force: true });
            }
            fs.mkdirSync(testDir, { recursive: true });
            saveConfigYaml(config, config);

            const paths = getConfigFilePaths();
            expect(fs.existsSync(paths.yaml)).toBe(true);
            expect(fs.existsSync(paths.json)).toBe(false);

            const loaded = loadConfigYaml(DEFAULT_CONFIG);
            expect(loaded).toEqual(config);
          }),
          { numRuns: 50 }
        );
      });

      it('dual-write mode: updates both files', () => {
        fc.assert(
          fc.property(appConfigArb, appConfigArb, (config1, config2) => {
            if (fs.existsSync(testDir)) {
              fs.rmSync(testDir, { recursive: true, force: true });
            }
            fs.mkdirSync(testDir, { recursive: true });
            const paths = getConfigFilePaths();
            fs.writeFileSync(paths.json, JSON.stringify(config1));

            saveConfigYaml(config2, config2);

            expect(fs.existsSync(paths.yaml)).toBe(true);
            expect(fs.existsSync(paths.json)).toBe(true);

            const yamlLoaded = loadConfigYaml(DEFAULT_CONFIG);
            const jsonContent = JSON.parse(fs.readFileSync(paths.json, 'utf8'));

            expect(yamlLoaded.autoUpdate).toBe(config2.autoUpdate);
            expect(jsonContent.autoUpdate).toBe(config2.autoUpdate);
          }),
          { numRuns: 50 }
        );
      });

      it('atomic writes: no temp files remain', () => {
        fc.assert(
          fc.property(appConfigArb, (config) => {
            if (fs.existsSync(testDir)) {
              fs.rmSync(testDir, { recursive: true, force: true });
            }
            fs.mkdirSync(testDir, { recursive: true });
            saveConfigYaml(config, config);

            const paths = getConfigFilePaths();
            expect(fs.existsSync(`${paths.yaml}.tmp`)).toBe(false);
            expect(fs.existsSync(`${paths.json}.tmp`)).toBe(false);
          }),
          { numRuns: 50 }
        );
      });

      it('round-trip: save then load preserves config', () => {
        fc.assert(
          fc.property(appConfigArb, (config) => {
            if (fs.existsSync(testDir)) {
              fs.rmSync(testDir, { recursive: true, force: true });
            }
            fs.mkdirSync(testDir, { recursive: true });
            saveConfigYaml(config, config);
            const loaded = loadConfigYaml(DEFAULT_CONFIG);

            expect(loaded).toEqual(config);
          }),
          { numRuns: 50 }
        );
      });
    });
  });

  describe('Migration Scenarios (Integration Tests)', () => {
    const appConfigArb = fc.record({
      autoUpdate: fc.boolean(),
      logLevel: fc.constantFrom('debug', 'info', 'warn', 'error'),
      autoCheckInterval: fc.constantFrom('1h', '2h', '4h', '12h', '24h', 'never'),
      messagePollingInterval: fc.constantFrom('10s', '30s', '1m', '5m', 'disabled'),
    });

    it('migration from JSON creates YAML and preserves JSON', () => {
      fc.assert(
        fc.property(appConfigArb, (config) => {
          const paths = getConfigFilePaths();
          if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
          }
          fs.mkdirSync(testDir, { recursive: true });
          fs.writeFileSync(paths.json, JSON.stringify(config));

          const loaded = loadConfigYaml(DEFAULT_CONFIG);

          expect(fs.existsSync(paths.yaml)).toBe(true);
          expect(fs.existsSync(paths.json)).toBe(true);
          expect(loaded.autoUpdate).toBe(config.autoUpdate);
          expect(loaded.logLevel).toBe(config.logLevel);
        }),
        { numRuns: 50 }
      );
    });

    it('post-migration: YAML takes precedence', () => {
      fc.assert(
        fc.property(appConfigArb, appConfigArb, (jsonConfig, yamlConfig) => {
          fc.pre(jsonConfig.autoUpdate !== yamlConfig.autoUpdate);

          if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
          }
          fs.mkdirSync(testDir, { recursive: true });
          const paths = getConfigFilePaths();
          fs.writeFileSync(paths.json, JSON.stringify(jsonConfig));

          loadConfigYaml(DEFAULT_CONFIG);

          const yamlLines = [
            `autoUpdate: ${yamlConfig.autoUpdate}`,
            `logLevel: ${yamlConfig.logLevel}`,
            `autoCheckInterval: ${yamlConfig.autoCheckInterval}`,
            `messagePollingInterval: ${yamlConfig.messagePollingInterval}`,
          ];
          fs.writeFileSync(paths.yaml, yamlLines.join('\n') + '\n');

          const loaded = loadConfigYaml(DEFAULT_CONFIG);

          expect(loaded.autoUpdate).toBe(yamlConfig.autoUpdate);
          expect(loaded.logLevel).toBe(yamlConfig.logLevel);
        }),
        { numRuns: 30 }
      );
    });

    it('dual-format save updates both files', () => {
      fc.assert(
        fc.property(appConfigArb, appConfigArb, (oldConfig, newConfig) => {
          if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
          }
          fs.mkdirSync(testDir, { recursive: true });
          const paths = getConfigFilePaths();
          fs.writeFileSync(paths.json, JSON.stringify(oldConfig));

          loadConfigYaml(DEFAULT_CONFIG);

          saveConfigYaml(newConfig, newConfig);

          const yamlLoaded = loadConfigYaml(DEFAULT_CONFIG);
          const jsonContent = JSON.parse(fs.readFileSync(paths.json, 'utf8'));

          expect(yamlLoaded.autoUpdate).toBe(newConfig.autoUpdate);
          expect(jsonContent.autoUpdate).toBe(newConfig.autoUpdate);
        }),
        { numRuns: 50 }
      );
    });

    it('fresh install creates YAML only', () => {
      fc.assert(
        fc.property(appConfigArb, (defaultConfig) => {
          if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
          }
          fs.mkdirSync(testDir, { recursive: true });

          const loaded = loadConfigYaml(defaultConfig);

          const paths = getConfigFilePaths();
          expect(fs.existsSync(paths.yaml)).toBe(true);
          expect(fs.existsSync(paths.json)).toBe(false);
          expect(loaded.autoUpdate).toBe(defaultConfig.autoUpdate);
          expect(loaded.logLevel).toBe(defaultConfig.logLevel);
          expect(loaded.autoCheckInterval).toBe(defaultConfig.autoCheckInterval);
          expect(loaded.messagePollingInterval).toBe(defaultConfig.messagePollingInterval);
        }),
        { numRuns: 30 }
      );
    });
  });
});
