import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';
import { nip19 } from 'nostr-tools';
import { extractNpubFromNostrData, isValidNpub } from './npub-validation';

describe('npub-validation', () => {
  describe('isValidNpub', () => {
    it('returns true for valid npub strings', () => {
      // Generate a valid npub from known hex pubkey
      const hexPubkey = '0'.repeat(64);
      const validNpub = nip19.npubEncode(hexPubkey);
      expect(isValidNpub(validNpub)).toBe(true);
    });

    it('returns false for invalid inputs', () => {
      const invalidInputs = [
        '',
        'npub',
        'npub1',
        'nsec1validbutnotnpub',
        'invalid string',
        'npub1!@#$',
      ];

      for (const input of invalidInputs) {
        expect(isValidNpub(input)).toBe(false);
      }
    });

    it('never throws on any string input', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          expect(() => isValidNpub(input)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('extractNpubFromNostrData', () => {
    // Generate valid hex pubkeys for testing
    const validHexPubkey = '0'.repeat(64);
    const validNpub = nip19.npubEncode(validHexPubkey);

    describe('npub format', () => {
      it('extracts valid npub', () => {
        const result = extractNpubFromNostrData(validNpub);
        expect(result).toEqual({ success: true, npub: validNpub });
      });

      it('extracts npub with nostr: prefix', () => {
        const result = extractNpubFromNostrData(`nostr:${validNpub}`);
        expect(result).toEqual({ success: true, npub: validNpub });
      });

      it('extracts npub with NOSTR: prefix (case-insensitive)', () => {
        const result = extractNpubFromNostrData(`NOSTR:${validNpub}`);
        expect(result).toEqual({ success: true, npub: validNpub });
      });

      it('handles whitespace around npub', () => {
        const result = extractNpubFromNostrData(`  ${validNpub}  `);
        expect(result).toEqual({ success: true, npub: validNpub });
      });

      it('rejects invalid npub format', () => {
        const result = extractNpubFromNostrData('npub1invalid');
        expect(result.success).toBe(false);
        expect(result).toHaveProperty('error');
      });
    });

    describe('hex pubkey format', () => {
      it('extracts lowercase hex pubkey and converts to npub', () => {
        const hexPubkey = 'abcdef0123456789'.repeat(4);
        const result = extractNpubFromNostrData(hexPubkey);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.npub).toMatch(/^npub1/);
          // Verify round-trip
          const decoded = nip19.decode(result.npub);
          expect(decoded.type).toBe('npub');
          expect(decoded.data).toBe(hexPubkey);
        }
      });

      it('extracts uppercase hex pubkey and converts to npub', () => {
        const hexPubkey = 'ABCDEF0123456789'.repeat(4);
        const result = extractNpubFromNostrData(hexPubkey);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.npub).toMatch(/^npub1/);
          // Verify round-trip - hex should be normalized to lowercase
          const decoded = nip19.decode(result.npub);
          expect(decoded.type).toBe('npub');
          expect(decoded.data).toBe(hexPubkey.toLowerCase());
        }
      });

      it('extracts mixed-case hex pubkey and converts to npub', () => {
        const hexPubkey = 'AbCdEf0123456789AbCdEf0123456789AbCdEf0123456789AbCdEf0123456789';
        const result = extractNpubFromNostrData(hexPubkey);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.npub).toMatch(/^npub1/);
          const decoded = nip19.decode(result.npub);
          expect(decoded.type).toBe('npub');
          expect(decoded.data).toBe(hexPubkey.toLowerCase());
        }
      });

      it('handles hex pubkey with whitespace', () => {
        const hexPubkey = '0'.repeat(64);
        const result = extractNpubFromNostrData(`  ${hexPubkey}  `);

        expect(result.success).toBe(true);
        if (result.success) {
          const decoded = nip19.decode(result.npub);
          expect(decoded.data).toBe(hexPubkey);
        }
      });

      it('rejects hex string that is too short', () => {
        const result = extractNpubFromNostrData('abcdef0123456789');
        expect(result.success).toBe(false);
      });

      it('rejects hex string that is too long', () => {
        const result = extractNpubFromNostrData('0'.repeat(65));
        expect(result.success).toBe(false);
      });

      it('rejects 64-char string with invalid hex characters', () => {
        const invalidHex = 'g'.repeat(64);
        const result = extractNpubFromNostrData(invalidHex);
        expect(result.success).toBe(false);
      });
    });

    describe('hex and npub produce same canonical npub', () => {
      it('hex pubkey converts to same npub as direct npub input', () => {
        const hexPubkey = 'abcdef0123456789'.repeat(4);
        const npubFromHex = nip19.npubEncode(hexPubkey);

        const resultFromHex = extractNpubFromNostrData(hexPubkey);
        const resultFromNpub = extractNpubFromNostrData(npubFromHex);

        expect(resultFromHex.success).toBe(true);
        expect(resultFromNpub.success).toBe(true);

        if (resultFromHex.success && resultFromNpub.success) {
          expect(resultFromHex.npub).toBe(resultFromNpub.npub);
        }
      });

      it('property: any valid hex produces valid npub that round-trips', () => {
        // Generate 64-char hex string from array of hex digits
        const hexDigit = fc.constantFrom(...'0123456789abcdef'.split(''));
        const hex64 = fc.array(hexDigit, { minLength: 64, maxLength: 64 }).map((arr) => arr.join(''));

        fc.assert(
          fc.property(hex64, (hex: string) => {
            const result = extractNpubFromNostrData(hex);

            expect(result.success).toBe(true);
            if (result.success) {
              expect(isValidNpub(result.npub)).toBe(true);

              const decoded = nip19.decode(result.npub);
              expect(decoded.type).toBe('npub');
              expect(decoded.data).toBe(hex);
            }
          }),
          { numRuns: 50 }
        );
      });
    });

    describe('nprofile format', () => {
      it('extracts npub from nprofile', () => {
        const hexPubkey = 'abcdef0123456789'.repeat(4);
        const nprofile = nip19.nprofileEncode({ pubkey: hexPubkey });

        const result = extractNpubFromNostrData(nprofile);

        expect(result.success).toBe(true);
        if (result.success) {
          const decoded = nip19.decode(result.npub);
          expect(decoded.data).toBe(hexPubkey);
        }
      });

      it('extracts npub from nprofile with relay hints', () => {
        const hexPubkey = 'abcdef0123456789'.repeat(4);
        const nprofile = nip19.nprofileEncode({
          pubkey: hexPubkey,
          relays: ['wss://relay.example.com'],
        });

        const result = extractNpubFromNostrData(nprofile);

        expect(result.success).toBe(true);
        if (result.success) {
          const decoded = nip19.decode(result.npub);
          expect(decoded.data).toBe(hexPubkey);
        }
      });

      it('extracts npub from nprofile with nostr: prefix', () => {
        const hexPubkey = 'abcdef0123456789'.repeat(4);
        const nprofile = nip19.nprofileEncode({ pubkey: hexPubkey });

        const result = extractNpubFromNostrData(`nostr:${nprofile}`);

        expect(result.success).toBe(true);
      });
    });

    describe('rejected formats', () => {
      it('rejects nsec (private key)', () => {
        const result = extractNpubFromNostrData('nsec1someprivatekey');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('private key');
        }
      });

      it('rejects note (event reference)', () => {
        const result = extractNpubFromNostrData('note1someeventid');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('event');
        }
      });

      it('rejects nevent (event reference)', () => {
        const result = extractNpubFromNostrData('nevent1someeventdata');
        expect(result.success).toBe(false);
      });

      it('rejects naddr (address reference)', () => {
        const result = extractNpubFromNostrData('naddr1someaddressdata');
        expect(result.success).toBe(false);
      });

      it('rejects random strings', () => {
        const result = extractNpubFromNostrData('hello world');
        expect(result.success).toBe(false);
      });

      it('rejects empty string', () => {
        const result = extractNpubFromNostrData('');
        expect(result.success).toBe(false);
      });
    });

    describe('error handling', () => {
      it('never throws, always returns result object', () => {
        fc.assert(
          fc.property(fc.string(), (input) => {
            const result = extractNpubFromNostrData(input);
            expect(result).toHaveProperty('success');
            if (result.success) {
              expect(result).toHaveProperty('npub');
            } else {
              expect(result).toHaveProperty('error');
            }
          }),
          { numRuns: 100 }
        );
      });
    });
  });
});
