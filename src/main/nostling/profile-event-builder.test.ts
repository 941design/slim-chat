import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';
import {
  buildPrivateProfileEvent,
  calculateProfileHash,
  validateProfileContent
} from './profile-event-builder';
import { generateKeypair } from './crypto';
import { PRIVATE_PROFILE_KIND, ProfileContent } from '../../shared/profile-types';
import { verifyEvent } from 'nostr-tools/pure';

const profileContentArbitrary = fc.record(
  {
    name: fc.option(fc.string(), { nil: undefined }),
    display_name: fc.option(fc.string(), { nil: undefined }),
    about: fc.option(fc.string(), { nil: undefined }),
    picture: fc.option(fc.webUrl(), { nil: undefined }),
    banner: fc.option(fc.webUrl(), { nil: undefined }),
    website: fc.option(fc.webUrl(), { nil: undefined }),
    nip05: fc.option(fc.emailAddress(), { nil: undefined }),
    lud16: fc.option(fc.emailAddress(), { nil: undefined }),
    lud06: fc.option(fc.string(), { nil: undefined })
  },
  { requiredKeys: [] }
).filter(obj => {
  const keys = Object.keys(obj).filter(k => obj[k as keyof typeof obj] !== undefined);
  return keys.length > 0;
});

const nonEmptyProfileContentArbitrary = fc.oneof(
  fc.record({ name: fc.string({ minLength: 1 }) }),
  fc.record({ about: fc.string({ minLength: 1 }) }),
  fc.record({ picture: fc.webUrl() }),
  fc.record({ name: fc.string(), about: fc.string() }),
  profileContentArbitrary.filter(obj => {
    const keys = Object.keys(obj).filter(k => obj[k as keyof typeof obj] !== undefined);
    return keys.length > 0;
  })
);

describe('Profile Event Builder', () => {
  describe('buildPrivateProfileEvent', () => {
    it('creates event with correct kind', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, () => {
          const { keypair } = generateKeypair();
          const event = buildPrivateProfileEvent({ name: 'Test' }, keypair);

          expect(event.kind).toBe(PRIVATE_PROFILE_KIND);
        }),
        { numRuns: 50 }
      );
    });

    it('creates event with pubkey matching keypair', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, () => {
          const { keypair } = generateKeypair();
          const content = { name: 'Alice' };
          const event = buildPrivateProfileEvent(content, keypair);

          expect(event.pubkey).toBe(keypair.pubkeyHex);
        }),
        { numRuns: 50 }
      );
    });

    it('creates event with empty tags array', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, () => {
          const { keypair } = generateKeypair();
          const content = { name: 'Bob' };
          const event = buildPrivateProfileEvent(content, keypair);

          expect(event.tags).toEqual([]);
        }),
        { numRuns: 50 }
      );
    });

    it('creates event with valid JSON content', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, (content) => {
          const { keypair } = generateKeypair();
          const event = buildPrivateProfileEvent(content, keypair);

          const parsed = JSON.parse(event.content);
          expect(parsed).toBeDefined();
          expect(typeof parsed).toBe('object');
        }),
        { numRuns: 100 }
      );
    });

    it('content round-trips correctly', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, (content) => {
          const { keypair } = generateKeypair();
          const event = buildPrivateProfileEvent(content, keypair);

          const parsed = JSON.parse(event.content);
          const contentRecord = content as Record<string, unknown>;
          const definedKeys = Object.keys(contentRecord).filter(k => contentRecord[k] !== undefined);

          for (const key of definedKeys) {
            expect(parsed[key]).toEqual(contentRecord[key]);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('creates event with valid signature', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, (content) => {
          const { keypair } = generateKeypair();
          const event = buildPrivateProfileEvent(content, keypair);

          const isValid = verifyEvent(event);
          expect(isValid).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('creates event with 64-char hex ID', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, () => {
          const { keypair } = generateKeypair();
          const event = buildPrivateProfileEvent({ name: 'Test' }, keypair);

          expect(event.id).toHaveLength(64);
          expect(event.id).toMatch(/^[0-9a-f]{64}$/);
        }),
        { numRuns: 50 }
      );
    });

    it('creates event with 128-char hex signature', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, () => {
          const { keypair } = generateKeypair();
          const event = buildPrivateProfileEvent({ name: 'Test' }, keypair);

          expect(event.sig).toHaveLength(128);
          expect(event.sig).toMatch(/^[0-9a-f]{128}$/);
        }),
        { numRuns: 50 }
      );
    });

    it('creates event with reasonable timestamp', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, () => {
          const { keypair } = generateKeypair();
          const before = Math.floor(Date.now() / 1000);
          const event = buildPrivateProfileEvent({ name: 'Test' }, keypair);
          const after = Math.floor(Date.now() / 1000);

          expect(event.created_at).toBeGreaterThanOrEqual(before);
          expect(event.created_at).toBeLessThanOrEqual(after);
        }),
        { numRuns: 50 }
      );
    });

    it('deterministic ID for same content and timestamp', () => {
      const { keypair } = generateKeypair();
      const content = { name: 'Alice', about: 'Developer' };
      const timestamp = 1700000000;

      const event1 = buildPrivateProfileEvent(content, keypair);
      const event1WithTimestamp = { ...event1, created_at: timestamp };

      const event2 = buildPrivateProfileEvent(content, keypair);
      const event2WithTimestamp = { ...event2, created_at: timestamp };

      expect(event1WithTimestamp.pubkey).toBe(event2WithTimestamp.pubkey);
      expect(event1WithTimestamp.kind).toBe(event2WithTimestamp.kind);
      expect(event1WithTimestamp.content).toBe(event2WithTimestamp.content);
    });

    it('throws on empty content object', () => {
      const { keypair } = generateKeypair();

      expect(() => buildPrivateProfileEvent({}, keypair)).toThrow('Profile content cannot be empty');
    });

    it('throws on content with only undefined values', () => {
      const { keypair } = generateKeypair();
      const content = { name: undefined, about: undefined };

      expect(() => buildPrivateProfileEvent(content, keypair)).toThrow('Profile content cannot be empty');
    });

    it('throws on invalid keypair with wrong secretKey length', () => {
      const content = { name: 'Test' };
      const invalidKeypair = {
        npub: 'npub1test',
        pubkeyHex: '0'.repeat(64),
        secretKey: new Uint8Array(16)
      };

      expect(() => buildPrivateProfileEvent(content, invalidKeypair)).toThrow('Invalid keypair');
    });

    it('handles all known profile fields', () => {
      const { keypair } = generateKeypair();
      const content: ProfileContent = {
        name: 'Alice',
        display_name: 'Alice Wonder',
        about: 'Developer',
        picture: 'https://example.com/pic.jpg',
        banner: 'https://example.com/banner.jpg',
        website: 'https://alice.dev',
        nip05: 'alice@example.com',
        lud16: 'alice@wallet.com',
        lud06: 'LNURL1234'
      };

      const event = buildPrivateProfileEvent(content, keypair);
      const parsed = JSON.parse(event.content);

      expect(parsed.name).toBe('Alice');
      expect(parsed.display_name).toBe('Alice Wonder');
      expect(parsed.about).toBe('Developer');
      expect(parsed.picture).toBe('https://example.com/pic.jpg');
      expect(parsed.banner).toBe('https://example.com/banner.jpg');
      expect(parsed.website).toBe('https://alice.dev');
      expect(parsed.nip05).toBe('alice@example.com');
      expect(parsed.lud16).toBe('alice@wallet.com');
      expect(parsed.lud06).toBe('LNURL1234');
    });

    it('handles custom fields', () => {
      const { keypair } = generateKeypair();
      const content = {
        name: 'Bob',
        customField: 'custom value',
        anotherCustomField: 'another value'
      };

      const event = buildPrivateProfileEvent(content, keypair);
      const parsed = JSON.parse(event.content);

      expect(parsed.name).toBe('Bob');
      expect(parsed.customField).toBe('custom value');
      expect(parsed.anotherCustomField).toBe('another value');
    });
  });

  describe('calculateProfileHash', () => {
    it('produces 64-character hex hash', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, (content) => {
          const hash = calculateProfileHash(content);

          expect(hash).toHaveLength(64);
          expect(hash).toMatch(/^[0-9a-f]{64}$/);
        }),
        { numRuns: 100 }
      );
    });

    it('is deterministic for same content', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, (content) => {
          const hash1 = calculateProfileHash(content);
          const hash2 = calculateProfileHash(content);

          expect(hash1).toBe(hash2);
        }),
        { numRuns: 100 }
      );
    });

    it('is order-independent', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          (val1, val2, val3, val4) => {
            const content1 = { a: val1, b: val2, c: val3, d: val4 };
            const content2 = { d: val4, b: val2, a: val1, c: val3 };
            const content3 = { c: val3, a: val1, d: val4, b: val2 };

            const hash1 = calculateProfileHash(content1);
            const hash2 = calculateProfileHash(content2);
            const hash3 = calculateProfileHash(content3);

            expect(hash1).toBe(hash2);
            expect(hash2).toBe(hash3);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('produces different hashes for different content', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }).filter(s => s !== 'same'),
          (name1, name2) => {
            fc.pre(name1 !== name2);

            const hash1 = calculateProfileHash({ name: name1 });
            const hash2 = calculateProfileHash({ name: name2 });

            expect(hash1).not.toBe(hash2);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('same content with different key order produces same hash', () => {
      const content1 = { name: 'Alice', about: 'Developer', picture: 'https://example.com/pic.jpg' };
      const content2 = { picture: 'https://example.com/pic.jpg', name: 'Alice', about: 'Developer' };
      const content3 = { about: 'Developer', picture: 'https://example.com/pic.jpg', name: 'Alice' };

      const hash1 = calculateProfileHash(content1);
      const hash2 = calculateProfileHash(content2);
      const hash3 = calculateProfileHash(content3);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('ignores undefined values in hash', () => {
      const content1 = { name: 'Alice', about: 'Developer' };
      const content2 = { name: 'Alice', about: 'Developer', picture: undefined };

      const hash1 = calculateProfileHash(content1);
      const hash2 = calculateProfileHash(content2);

      expect(hash1).toBe(hash2);
    });

    it('throws on empty content object', () => {
      expect(() => calculateProfileHash({})).toThrow('Cannot hash empty content');
    });

    it('throws on content with only undefined values', () => {
      const content = { name: undefined, about: undefined };

      expect(() => calculateProfileHash(content)).toThrow('Cannot hash empty content');
    });

    it('throws on null content', () => {
      expect(() => calculateProfileHash(null as unknown as ProfileContent)).toThrow('Cannot hash empty content');
    });

    it('throws on non-object content', () => {
      expect(() => calculateProfileHash('string' as unknown as ProfileContent)).toThrow('Cannot hash empty content');
    });

    it('handles all profile fields consistently', () => {
      const content: ProfileContent = {
        name: 'Test',
        display_name: 'Test User',
        about: 'About text',
        picture: 'https://example.com/pic.jpg',
        banner: 'https://example.com/banner.jpg',
        website: 'https://test.com',
        nip05: 'test@example.com',
        lud16: 'test@wallet.com',
        lud06: 'LNURL1234'
      };

      const hash = calculateProfileHash(content);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('validateProfileContent', () => {
    it('accepts valid profile content with known fields', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, (content) => {
          const result = validateProfileContent(content);

          expect(result).toBeDefined();
          expect(typeof result).toBe('object');
        }),
        { numRuns: 100 }
      );
    });

    it('returns same content for valid input', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, (content) => {
          const result = validateProfileContent(content);

          const contentRecord = content as Record<string, unknown>;
          const definedKeys = Object.keys(contentRecord).filter(k => contentRecord[k] !== undefined);
          for (const key of definedKeys) {
            expect(result[key]).toEqual(contentRecord[key]);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('accepts content with single field', () => {
      const validInputs = [
        { name: 'Alice' },
        { about: 'Developer' },
        { picture: 'https://example.com/pic.jpg' },
        { display_name: 'Alice Wonder' }
      ];

      for (const input of validInputs) {
        expect(() => validateProfileContent(input)).not.toThrow();
      }
    });

    it('accepts content with all known fields', () => {
      const content = {
        name: 'Alice',
        display_name: 'Alice Wonder',
        about: 'Developer',
        picture: 'https://example.com/pic.jpg',
        banner: 'https://example.com/banner.jpg',
        website: 'https://alice.dev',
        nip05: 'alice@example.com',
        lud16: 'alice@wallet.com',
        lud06: 'LNURL1234'
      };

      expect(() => validateProfileContent(content)).not.toThrow();
    });

    it('accepts content with custom fields', () => {
      const content = {
        name: 'Bob',
        customField: 'custom value'
      };

      expect(() => validateProfileContent(content)).not.toThrow();
    });

    it('accepts content with only custom fields', () => {
      const content = {
        customField1: 'value1',
        customField2: 'value2'
      };

      expect(() => validateProfileContent(content)).not.toThrow();
    });

    it('throws on null content', () => {
      expect(() => validateProfileContent(null)).toThrow('Profile content is required');
    });

    it('throws on undefined content', () => {
      expect(() => validateProfileContent(undefined)).toThrow('Profile content is required');
    });

    it('throws on non-object content', () => {
      const invalidInputs = [
        'string',
        123,
        true,
        false,
        [],
        () => {}
      ];

      for (const input of invalidInputs) {
        expect(() => validateProfileContent(input)).toThrow('Profile content must be an object');
      }
    });

    it('throws on empty object', () => {
      expect(() => validateProfileContent({})).toThrow('Profile content cannot be empty');
    });

    it('throws on object with only undefined values', () => {
      const content = {
        name: undefined,
        about: undefined,
        picture: undefined
      };

      expect(() => validateProfileContent(content)).toThrow('Profile content cannot be empty');
    });

    it('throws on non-string field values', () => {
      const invalidInputs = [
        { name: 123 },
        { about: true },
        { picture: { url: 'test' } },
        { name: 'valid', about: ['array'] }
      ];

      for (const input of invalidInputs) {
        expect(() => validateProfileContent(input)).toThrow('Profile fields must be strings');
      }
    });

    it('allows undefined fields when other fields are defined', () => {
      const content = {
        name: 'Alice',
        about: undefined,
        picture: 'https://example.com/pic.jpg'
      };

      expect(() => validateProfileContent(content)).not.toThrow();
      const result = validateProfileContent(content);
      expect(result.name).toBe('Alice');
      expect(result.picture).toBe('https://example.com/pic.jpg');
    });

    it('validates and preserves all field types', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          fc.webUrl(),
          (name, about, picture) => {
            const content = { name, about, picture };
            const result = validateProfileContent(content);

            expect(result.name).toBe(name);
            expect(result.about).toBe(about);
            expect(result.picture).toBe(picture);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Integration: buildPrivateProfileEvent with validateProfileContent', () => {
    it('builds event from validated content', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, (content) => {
          const validated = validateProfileContent(content);
          const { keypair } = generateKeypair();
          const event = buildPrivateProfileEvent(validated, keypair);

          expect(event.kind).toBe(PRIVATE_PROFILE_KIND);
          expect(verifyEvent(event)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Integration: calculateProfileHash with buildPrivateProfileEvent', () => {
    it('same content produces same hash regardless of event', () => {
      fc.assert(
        fc.property(nonEmptyProfileContentArbitrary, (content) => {
          const { keypair: kp1 } = generateKeypair();
          const { keypair: kp2 } = generateKeypair();

          const event1 = buildPrivateProfileEvent(content, kp1);
          const event2 = buildPrivateProfileEvent(content, kp2);

          const hash1 = calculateProfileHash(content);
          const hash2 = calculateProfileHash(content);

          expect(hash1).toBe(hash2);

          const parsedContent1 = JSON.parse(event1.content);
          const parsedContent2 = JSON.parse(event2.content);

          const hashFromEvent1 = calculateProfileHash(parsedContent1);
          const hashFromEvent2 = calculateProfileHash(parsedContent2);

          expect(hashFromEvent1).toBe(hash1);
          expect(hashFromEvent2).toBe(hash2);
        }),
        { numRuns: 50 }
      );
    });
  });
});
