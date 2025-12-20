import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import fs from 'fs/promises';
import path from 'path';
import type { NostlingRelayEndpoint } from '../../shared/types';
import {
  getRelayConfigPaths,
  computeFileHashYaml,
  loadRelaysYaml,
  saveRelaysYaml,
} from './relay-config-yaml-migration';

describe('relay-config-yaml-migration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(__dirname, `test-yaml-migration-${Date.now()}-${Math.random()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
    }
  });

  describe('getRelayConfigPaths', () => {
    it('returns paths in same directory', () => {
      const identityDir = '/test/identities/abc123';
      const paths = getRelayConfigPaths(identityDir);
      expect(path.dirname(paths.yaml)).toBe(identityDir);
      expect(path.dirname(paths.json)).toBe(identityDir);
    });

    it('YAML path ends with relays.yaml', () => {
      const paths = getRelayConfigPaths('/test/identities/abc');
      expect(paths.yaml.endsWith('relays.yaml')).toBe(true);
    });

    it('JSON path ends with relays.json', () => {
      const paths = getRelayConfigPaths('/test/identities/abc');
      expect(paths.json.endsWith('relays.json')).toBe(true);
    });

    it('paths are absolute', () => {
      const identityDir = path.join('/test', 'identities', 'abc');
      const paths = getRelayConfigPaths(identityDir);
      expect(path.isAbsolute(paths.yaml)).toBe(true);
      expect(path.isAbsolute(paths.json)).toBe(true);
    });

    it('property: deterministic paths for same identityDir', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (dir) => {
          const paths1 = getRelayConfigPaths(dir);
          const paths2 = getRelayConfigPaths(dir);
          return paths1.yaml === paths2.yaml && paths1.json === paths2.json;
        }),
        { numRuns: 100 }
      );
    });

    it('property: different directories produce different paths', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (dir1, dir2) => {
          if (dir1 === dir2) return true;
          const paths1 = getRelayConfigPaths(dir1);
          const paths2 = getRelayConfigPaths(dir2);
          return paths1.yaml !== paths2.yaml;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('computeFileHashYaml', () => {
    it('produces 64-character SHA-256 hex hash', () => {
      const hash = computeFileHashYaml('test content');
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });

    it('hash is lowercase hexadecimal', () => {
      const hash = computeFileHashYaml('test');
      expect(hash).toBe(hash.toLowerCase());
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    it('property: deterministic hashing', () => {
      fc.assert(
        fc.property(fc.string(), (content) => {
          const hash1 = computeFileHashYaml(content);
          const hash2 = computeFileHashYaml(content);
          return hash1 === hash2;
        }),
        { numRuns: 100 }
      );
    });

    it('property: different content produces different hash', () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), (content1, content2) => {
          if (content1 === content2) return true;
          const hash1 = computeFileHashYaml(content1);
          const hash2 = computeFileHashYaml(content2);
          return hash1 !== hash2;
        }),
        { numRuns: 100 }
      );
    });

    it('property: hash length always 64 characters', () => {
      fc.assert(
        fc.property(fc.string(), (content) => {
          const hash = computeFileHashYaml(content);
          return hash.length === 64;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('loadRelaysYaml', () => {
    const relayArbitrary = fc.record({
      url: fc.webUrl({ validSchemes: ['wss'] }),
      read: fc.boolean(),
      write: fc.boolean(),
      order: fc.nat({ max: 1000 }),
    });

    const relaysArrayArbitrary = fc.array(relayArbitrary, { minLength: 0, maxLength: 20 });

    describe('neither YAML nor JSON exists', () => {
      it('creates YAML with defaults and returns defaults', async () => {
        const identityDir = path.join(tempDir, 'new-identity');
        const fileHashes = new Map<string, string>();
        const defaults: NostlingRelayEndpoint[] = [
          { url: 'wss://relay.example.com', read: true, write: true, order: 0 },
        ];

        const result = await loadRelaysYaml(identityDir, 'test-id', defaults, fileHashes);

        expect(result).toEqual(defaults);
        expect(fileHashes.has('test-id')).toBe(true);

        const paths = getRelayConfigPaths(identityDir);
        const yamlExists = await fs.access(paths.yaml).then(() => true).catch(() => false);
        expect(yamlExists).toBe(true);
      });

      it('property: always returns defaults when no config exists', () => {
        return fc.assert(
          fc.asyncProperty(relaysArrayArbitrary, async (defaults) => {
            const identityDir = path.join(tempDir, `prop-${Math.random()}`);
            const fileHashes = new Map<string, string>();

            const result = await loadRelaysYaml(identityDir, 'test-id', defaults, fileHashes);

            return JSON.stringify(result) === JSON.stringify(defaults);
          }),
          { numRuns: 20 }
        );
      });
    });

    describe('only YAML exists', () => {
      it('loads from YAML and updates hash', async () => {
        const identityDir = path.join(tempDir, 'yaml-only');
        await fs.mkdir(identityDir, { recursive: true });

        const relays: NostlingRelayEndpoint[] = [
          { url: 'wss://relay1.com', read: true, write: false, order: 2 },
          { url: 'wss://relay2.com', read: false, write: true, order: 1 },
        ];

        const paths = getRelayConfigPaths(identityDir);
        const yamlContent = `# Relay Configuration (YAML format)
# Each relay has:
#   url: relay WebSocket URL (wss://...)
#   read: whether to read events from this relay (true/false)
#   write: whether to write events to this relay (true/false)
#   order: priority order (lower numbers first)

- url: wss://relay1.com
  read: true
  write: false
  order: 2
- url: wss://relay2.com
  read: false
  write: true
  order: 1
`;
        await fs.writeFile(paths.yaml, yamlContent);

        const fileHashes = new Map<string, string>();
        const result = await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

        expect(result).toHaveLength(2);
        expect(result[0].url).toBe('wss://relay2.com');
        expect(result[0].order).toBe(1);
        expect(result[1].url).toBe('wss://relay1.com');
        expect(result[1].order).toBe(2);
        expect(fileHashes.has('test-id')).toBe(true);
      });

      it('property: loaded relays are sorted by order', () => {
        return fc.assert(
          fc.asyncProperty(relaysArrayArbitrary, async (relays) => {
            const identityDir = path.join(tempDir, `yaml-sort-${Math.random()}`);
            await fs.mkdir(identityDir, { recursive: true });

            const paths = getRelayConfigPaths(identityDir);
            const yamlLines = ['# Relay Configuration (YAML format)', ''];
            yamlLines.push(
              ...relays.map(
                (r) =>
                  `- url: ${r.url}\n  read: ${r.read}\n  write: ${r.write}\n  order: ${r.order}`
              )
            );
            await fs.writeFile(paths.yaml, yamlLines.join('\n'));

            const fileHashes = new Map<string, string>();
            const result = await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

            for (let i = 1; i < result.length; i++) {
              if (result[i - 1].order > result[i].order) {
                return false;
              }
            }
            return true;
          }),
          { numRuns: 20 }
        );
      });
    });

    describe('only JSON exists (migration)', () => {
      it('migrates JSON to YAML and returns relays', async () => {
        const identityDir = path.join(tempDir, 'json-migration');
        await fs.mkdir(identityDir, { recursive: true });

        const relays: NostlingRelayEndpoint[] = [
          { url: 'wss://old.relay.com', read: true, write: true, order: 0 },
        ];

        const paths = getRelayConfigPaths(identityDir);
        await fs.writeFile(paths.json, JSON.stringify(relays));

        const fileHashes = new Map<string, string>();
        const result = await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

        expect(result).toEqual(relays);
        expect(fileHashes.has('test-id')).toBe(true);

        const yamlExists = await fs.access(paths.yaml).then(() => true).catch(() => false);
        expect(yamlExists).toBe(true);

        const jsonStillExists = await fs.access(paths.json).then(() => true).catch(() => false);
        expect(jsonStillExists).toBe(true);
      });

      it('property: migration preserves relay data', () => {
        return fc.assert(
          fc.asyncProperty(relaysArrayArbitrary, async (relays) => {
            const identityDir = path.join(tempDir, `json-preserve-${Math.random()}`);
            await fs.mkdir(identityDir, { recursive: true });

            const paths = getRelayConfigPaths(identityDir);
            await fs.writeFile(paths.json, JSON.stringify(relays));

            const fileHashes = new Map<string, string>();
            const result = await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

            const sortedOriginal = [...relays].sort((a, b) => a.order - b.order);
            return JSON.stringify(result) === JSON.stringify(sortedOriginal);
          }),
          { numRuns: 20 }
        );
      });
    });

    describe('both YAML and JSON exist', () => {
      it('YAML takes precedence, JSON ignored', async () => {
        const identityDir = path.join(tempDir, 'both-formats');
        await fs.mkdir(identityDir, { recursive: true });

        const yamlRelays: NostlingRelayEndpoint[] = [
          { url: 'wss://yaml.relay.com', read: true, write: true, order: 0 },
        ];
        const jsonRelays: NostlingRelayEndpoint[] = [
          { url: 'wss://json.relay.com', read: false, write: false, order: 0 },
        ];

        const paths = getRelayConfigPaths(identityDir);
        const yamlContent = `# Relay Configuration (YAML format)

- url: wss://yaml.relay.com
  read: true
  write: true
  order: 0
`;
        await fs.writeFile(paths.yaml, yamlContent);
        await fs.writeFile(paths.json, JSON.stringify(jsonRelays));

        const fileHashes = new Map<string, string>();
        const result = await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

        expect(result).toEqual(yamlRelays);
        expect(result[0].url).toBe('wss://yaml.relay.com');
      });
    });

    describe('malformed files', () => {
      it('malformed YAML returns empty array', async () => {
        const identityDir = path.join(tempDir, 'malformed-yaml');
        await fs.mkdir(identityDir, { recursive: true });

        const paths = getRelayConfigPaths(identityDir);
        await fs.writeFile(paths.yaml, 'not: an: array: [');

        const fileHashes = new Map<string, string>();
        const result = await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

        expect(result).toEqual([]);
      });

      it('malformed JSON falls back to defaults', async () => {
        const identityDir = path.join(tempDir, 'malformed-json');
        await fs.mkdir(identityDir, { recursive: true });

        const paths = getRelayConfigPaths(identityDir);
        await fs.writeFile(paths.json, '{ invalid json }');

        const defaults: NostlingRelayEndpoint[] = [
          { url: 'wss://default.com', read: true, write: true, order: 0 },
        ];

        const fileHashes = new Map<string, string>();
        const result = await loadRelaysYaml(identityDir, 'test-id', defaults, fileHashes);

        expect(result).toEqual(defaults);
      });

      it('non-array YAML returns empty array', async () => {
        const identityDir = path.join(tempDir, 'non-array-yaml');
        await fs.mkdir(identityDir, { recursive: true });

        const paths = getRelayConfigPaths(identityDir);
        await fs.writeFile(paths.yaml, 'url: wss://relay.com\nread: true');

        const fileHashes = new Map<string, string>();
        const result = await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

        expect(result).toEqual([]);
      });

      it('non-array JSON returns empty array', async () => {
        const identityDir = path.join(tempDir, 'non-array-json');
        await fs.mkdir(identityDir, { recursive: true });

        const paths = getRelayConfigPaths(identityDir);
        await fs.writeFile(paths.json, '{"url": "wss://relay.com"}');

        const fileHashes = new Map<string, string>();
        const result = await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

        expect(result).toEqual([]);
      });
    });

    describe('hash tracking', () => {
      it('stores hash after loading YAML', async () => {
        const identityDir = path.join(tempDir, 'hash-yaml');
        await fs.mkdir(identityDir, { recursive: true });

        const paths = getRelayConfigPaths(identityDir);
        const yamlContent = '- url: wss://relay.com\n  read: true\n  write: true\n  order: 0\n';
        await fs.writeFile(paths.yaml, yamlContent);

        const fileHashes = new Map<string, string>();
        await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

        expect(fileHashes.has('test-id')).toBe(true);
        expect(fileHashes.get('test-id')).toBe(computeFileHashYaml(yamlContent));
      });

      it('stores hash after migration from JSON', async () => {
        const identityDir = path.join(tempDir, 'hash-migration');
        await fs.mkdir(identityDir, { recursive: true });

        const relays: NostlingRelayEndpoint[] = [
          { url: 'wss://relay.com', read: true, write: true, order: 0 },
        ];

        const paths = getRelayConfigPaths(identityDir);
        await fs.writeFile(paths.json, JSON.stringify(relays));

        const fileHashes = new Map<string, string>();
        await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

        expect(fileHashes.has('test-id')).toBe(true);

        const yamlContent = await fs.readFile(paths.yaml, 'utf-8');
        expect(fileHashes.get('test-id')).toBe(computeFileHashYaml(yamlContent));
      });

      it('property: hash always set after successful load', () => {
        return fc.assert(
          fc.asyncProperty(relaysArrayArbitrary, async (relays) => {
            const identityDir = path.join(tempDir, `hash-prop-${Math.random()}`);
            const fileHashes = new Map<string, string>();

            await loadRelaysYaml(identityDir, 'test-id', relays, fileHashes);

            return fileHashes.has('test-id');
          }),
          { numRuns: 20 }
        );
      });
    });
  });

  describe('saveRelaysYaml', () => {
    const relayArbitrary = fc.record({
      url: fc.webUrl({ validSchemes: ['wss'] }),
      read: fc.boolean(),
      write: fc.boolean(),
      order: fc.nat({ max: 1000 }),
    });

    const relaysArrayArbitrary = fc.array(relayArbitrary, { minLength: 0, maxLength: 20 });

    describe('basic save operations', () => {
      it('writes YAML file with correct content', async () => {
        const identityDir = path.join(tempDir, 'basic-save');
        const fileHashes = new Map<string, string>();
        const relays: NostlingRelayEndpoint[] = [
          { url: 'wss://relay.com', read: true, write: true, order: 0 },
        ];

        const result = await saveRelaysYaml(identityDir, 'test-id', relays, fileHashes);

        expect(result.config).toEqual(relays);
        expect(result.conflict).toBeUndefined();

        const paths = getRelayConfigPaths(identityDir);
        const yamlContent = await fs.readFile(paths.yaml, 'utf-8');
        expect(yamlContent).toContain('wss://relay.com');
        expect(yamlContent).toContain('read: true');
      });

      it('updates hash after successful write', async () => {
        const identityDir = path.join(tempDir, 'hash-update');
        const fileHashes = new Map<string, string>();
        const relays: NostlingRelayEndpoint[] = [
          { url: 'wss://relay.com', read: true, write: true, order: 0 },
        ];

        await saveRelaysYaml(identityDir, 'test-id', relays, fileHashes);

        expect(fileHashes.has('test-id')).toBe(true);

        const paths = getRelayConfigPaths(identityDir);
        const yamlContent = await fs.readFile(paths.yaml, 'utf-8');
        expect(fileHashes.get('test-id')).toBe(computeFileHashYaml(yamlContent));
      });

      it('property: always creates valid YAML file', () => {
        return fc.assert(
          fc.asyncProperty(relaysArrayArbitrary, async (relays) => {
            const identityDir = path.join(tempDir, `save-valid-${Math.random()}`);
            const fileHashes = new Map<string, string>();

            await saveRelaysYaml(identityDir, 'test-id', relays, fileHashes);

            const paths = getRelayConfigPaths(identityDir);
            const yamlContent = await fs.readFile(paths.yaml, 'utf-8');
            return yamlContent.length > 0;
          }),
          { numRuns: 20 }
        );
      });
    });

    describe('dual-write behavior', () => {
      it('writes both YAML and JSON if JSON exists', async () => {
        const identityDir = path.join(tempDir, 'dual-write');
        await fs.mkdir(identityDir, { recursive: true });

        const paths = getRelayConfigPaths(identityDir);
        await fs.writeFile(paths.json, '[]');

        const fileHashes = new Map<string, string>();
        const relays: NostlingRelayEndpoint[] = [
          { url: 'wss://relay.com', read: true, write: true, order: 0 },
        ];

        await saveRelaysYaml(identityDir, 'test-id', relays, fileHashes);

        const yamlContent = await fs.readFile(paths.yaml, 'utf-8');
        const jsonContent = await fs.readFile(paths.json, 'utf-8');

        expect(yamlContent).toContain('wss://relay.com');
        expect(jsonContent).toContain('wss://relay.com');

        const jsonParsed = JSON.parse(jsonContent);
        expect(jsonParsed).toEqual(relays);
      });

      it('only writes YAML if JSON does not exist', async () => {
        const identityDir = path.join(tempDir, 'yaml-only-write');
        const fileHashes = new Map<string, string>();
        const relays: NostlingRelayEndpoint[] = [
          { url: 'wss://relay.com', read: true, write: true, order: 0 },
        ];

        await saveRelaysYaml(identityDir, 'test-id', relays, fileHashes);

        const paths = getRelayConfigPaths(identityDir);
        const yamlExists = await fs.access(paths.yaml).then(() => true).catch(() => false);
        const jsonExists = await fs.access(paths.json).then(() => true).catch(() => false);

        expect(yamlExists).toBe(true);
        expect(jsonExists).toBe(false);
      });

      it('property: JSON written only when it already exists', () => {
        return fc.assert(
          fc.asyncProperty(
            relaysArrayArbitrary,
            fc.boolean(),
            async (relays, createJson) => {
              const identityDir = path.join(tempDir, `dual-${Math.random()}`);
              await fs.mkdir(identityDir, { recursive: true });

              const paths = getRelayConfigPaths(identityDir);
              if (createJson) {
                await fs.writeFile(paths.json, '[]');
              }

              const fileHashes = new Map<string, string>();
              await saveRelaysYaml(identityDir, 'test-id', relays, fileHashes);

              const jsonExists = await fs.access(paths.json).then(() => true).catch(() => false);
              return jsonExists === createJson;
            }
          ),
          { numRuns: 20 }
        );
      });
    });

    describe('conflict detection', () => {
      it('detects external modification and returns conflict', async () => {
        const identityDir = path.join(tempDir, 'conflict-detect');
        await fs.mkdir(identityDir, { recursive: true });

        const originalRelays: NostlingRelayEndpoint[] = [
          { url: 'wss://original.com', read: true, write: true, order: 0 },
        ];

        const fileHashes = new Map<string, string>();
        await saveRelaysYaml(identityDir, 'test-id', originalRelays, fileHashes);

        const paths = getRelayConfigPaths(identityDir);
        await fs.writeFile(paths.yaml, '# externally modified\n- url: wss://external.com\n  read: true\n  write: true\n  order: 0\n');

        const newRelays: NostlingRelayEndpoint[] = [
          { url: 'wss://new.com', read: true, write: true, order: 0 },
        ];

        const result = await saveRelaysYaml(identityDir, 'test-id', newRelays, fileHashes);

        expect(result.conflict).toBeDefined();
        expect(result.conflict?.conflicted).toBe(true);
        expect(result.config).toBeUndefined();
      });

      it('no conflict if no stored hash', async () => {
        const identityDir = path.join(tempDir, 'no-hash');
        await fs.mkdir(identityDir, { recursive: true });

        const paths = getRelayConfigPaths(identityDir);
        await fs.writeFile(paths.yaml, '- url: wss://existing.com\n  read: true\n  write: true\n  order: 0\n');

        const fileHashes = new Map<string, string>();
        const relays: NostlingRelayEndpoint[] = [
          { url: 'wss://new.com', read: true, write: true, order: 0 },
        ];

        const result = await saveRelaysYaml(identityDir, 'test-id', relays, fileHashes);

        expect(result.conflict).toBeUndefined();
        expect(result.config).toEqual(relays);
      });

      it('no conflict if file matches stored hash', async () => {
        const identityDir = path.join(tempDir, 'hash-match');
        const fileHashes = new Map<string, string>();

        const relays1: NostlingRelayEndpoint[] = [
          { url: 'wss://relay1.com', read: true, write: true, order: 0 },
        ];
        await saveRelaysYaml(identityDir, 'test-id', relays1, fileHashes);

        const relays2: NostlingRelayEndpoint[] = [
          { url: 'wss://relay2.com', read: false, write: false, order: 1 },
        ];
        const result = await saveRelaysYaml(identityDir, 'test-id', relays2, fileHashes);

        expect(result.conflict).toBeUndefined();
        expect(result.config).toEqual(relays2);
      });

      it('property: conflict detection prevents overwriting external changes', () => {
        return fc.assert(
          fc.asyncProperty(
            relaysArrayArbitrary,
            relaysArrayArbitrary,
            async (relays1, relays2) => {
              const identityDir = path.join(tempDir, `conflict-${Math.random()}`);
              const fileHashes = new Map<string, string>();

              await saveRelaysYaml(identityDir, 'test-id', relays1, fileHashes);

              const paths = getRelayConfigPaths(identityDir);
              await fs.writeFile(paths.yaml, '# external modification\n[]');

              const result = await saveRelaysYaml(identityDir, 'test-id', relays2, fileHashes);

              return result.conflict !== undefined;
            }
          ),
          { numRuns: 20 }
        );
      });
    });

    describe('atomic writes', () => {
      it('uses temporary file for YAML write', async () => {
        const identityDir = path.join(tempDir, 'atomic-yaml');
        const fileHashes = new Map<string, string>();
        const relays: NostlingRelayEndpoint[] = [
          { url: 'wss://relay.com', read: true, write: true, order: 0 },
        ];

        await saveRelaysYaml(identityDir, 'test-id', relays, fileHashes);

        const paths = getRelayConfigPaths(identityDir);
        const tempExists = await fs.access(paths.yaml + '.tmp').then(() => true).catch(() => false);
        expect(tempExists).toBe(false);
      });

      it('uses temporary file for JSON write when dual-writing', async () => {
        const identityDir = path.join(tempDir, 'atomic-json');
        await fs.mkdir(identityDir, { recursive: true });

        const paths = getRelayConfigPaths(identityDir);
        await fs.writeFile(paths.json, '[]');

        const fileHashes = new Map<string, string>();
        const relays: NostlingRelayEndpoint[] = [
          { url: 'wss://relay.com', read: true, write: true, order: 0 },
        ];

        await saveRelaysYaml(identityDir, 'test-id', relays, fileHashes);

        const jsonTempExists = await fs.access(paths.json + '.tmp').then(() => true).catch(() => false);
        expect(jsonTempExists).toBe(false);
      });
    });

    describe('round-trip consistency', () => {
      it('property: save and load produces same data', () => {
        return fc.assert(
          fc.asyncProperty(relaysArrayArbitrary, async (relays) => {
            const identityDir = path.join(tempDir, `roundtrip-${Math.random()}`);
            const fileHashes = new Map<string, string>();

            await saveRelaysYaml(identityDir, 'test-id', relays, fileHashes);

            const loadedHashes = new Map<string, string>();
            const loaded = await loadRelaysYaml(identityDir, 'test-id', [], loadedHashes);

            const sortedOriginal = [...relays].sort((a, b) => a.order - b.order);
            return JSON.stringify(loaded) === JSON.stringify(sortedOriginal);
          }),
          { numRuns: 30 }
        );
      });

      it('property: hash consistency after save and load', () => {
        return fc.assert(
          fc.asyncProperty(relaysArrayArbitrary, async (relays) => {
            const identityDir = path.join(tempDir, `hash-consistency-${Math.random()}`);
            const saveHashes = new Map<string, string>();

            await saveRelaysYaml(identityDir, 'test-id', relays, saveHashes);
            const savedHash = saveHashes.get('test-id');

            const loadHashes = new Map<string, string>();
            await loadRelaysYaml(identityDir, 'test-id', [], loadHashes);
            const loadedHash = loadHashes.get('test-id');

            return savedHash === loadedHash;
          }),
          { numRuns: 30 }
        );
      });
    });
  });

  describe('integration scenarios', () => {
    const relayArbitrary = fc.record({
      url: fc.webUrl({ validSchemes: ['wss'] }),
      read: fc.boolean(),
      write: fc.boolean(),
      order: fc.nat({ max: 1000 }),
    });

    const relaysArrayArbitrary = fc.array(relayArbitrary, { minLength: 1, maxLength: 10 });

    it('complete workflow: create, save, load, modify, save, load', async () => {
      const identityDir = path.join(tempDir, 'workflow');
      const fileHashes = new Map<string, string>();

      const defaults: NostlingRelayEndpoint[] = [
        { url: 'wss://default.com', read: true, write: true, order: 0 },
      ];

      const loaded1 = await loadRelaysYaml(identityDir, 'test-id', defaults, fileHashes);
      expect(loaded1).toEqual(defaults);

      const modified: NostlingRelayEndpoint[] = [
        { url: 'wss://modified.com', read: false, write: true, order: 1 },
      ];

      const saveResult = await saveRelaysYaml(identityDir, 'test-id', modified, fileHashes);
      expect(saveResult.config).toEqual(modified);

      const loaded2 = await loadRelaysYaml(identityDir, 'test-id', defaults, fileHashes);
      expect(loaded2).toEqual(modified);
    });

    it('property: multiple save-load cycles preserve data', () => {
      return fc.assert(
        fc.asyncProperty(
          relaysArrayArbitrary,
          relaysArrayArbitrary,
          relaysArrayArbitrary,
          async (relays1, relays2, relays3) => {
            const identityDir = path.join(tempDir, `multi-cycle-${Math.random()}`);
            const fileHashes = new Map<string, string>();

            await saveRelaysYaml(identityDir, 'test-id', relays1, fileHashes);
            const loaded1 = await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

            await saveRelaysYaml(identityDir, 'test-id', relays2, fileHashes);
            const loaded2 = await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

            await saveRelaysYaml(identityDir, 'test-id', relays3, fileHashes);
            const loaded3 = await loadRelaysYaml(identityDir, 'test-id', [], fileHashes);

            const sorted1 = [...relays1].sort((a, b) => a.order - b.order);
            const sorted2 = [...relays2].sort((a, b) => a.order - b.order);
            const sorted3 = [...relays3].sort((a, b) => a.order - b.order);

            return (
              JSON.stringify(loaded1) === JSON.stringify(sorted1) &&
              JSON.stringify(loaded2) === JSON.stringify(sorted2) &&
              JSON.stringify(loaded3) === JSON.stringify(sorted3)
            );
          }
        ),
        { numRuns: 15 }
      );
    });
  });
});
