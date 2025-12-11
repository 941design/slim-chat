import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import {
  deriveKeypair,
  generateKeypair,
  isValidNsec,
  isValidNpub,
  encryptMessage,
  decryptMessage,
  buildKind4Event,
  npubToHex,
  hexToNpub,
  NostrKeypair,
} from './crypto';

describe('Nostr Cryptography', () => {
  describe('generateKeypair', () => {
    it('generates unique keypairs on successive calls', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const { nsec: nsec1, keypair: kp1 } = generateKeypair();
          const { nsec: nsec2, keypair: kp2 } = generateKeypair();

          expect(nsec1).not.toBe(nsec2);
          expect(kp1.npub).not.toBe(kp2.npub);
          expect(kp1.pubkeyHex).not.toBe(kp2.pubkeyHex);
        }),
        { numRuns: 10 }
      );
    });

    it('produces valid nsec and keypair', () => {
      const { nsec, keypair } = generateKeypair();

      expect(isValidNsec(nsec)).toBe(true);
      expect(isValidNpub(keypair.npub)).toBe(true);
      expect(keypair.secretKey).toHaveLength(32);
      expect(keypair.pubkeyHex).toHaveLength(64);
      expect(keypair.pubkeyHex).toMatch(/^[0-9a-f]{64}$/);
    });

    it('satisfies round-trip property with deriveKeypair', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const { nsec, keypair: original } = generateKeypair();
          const derived = deriveKeypair(nsec);

          expect(derived.npub).toBe(original.npub);
          expect(derived.pubkeyHex).toBe(original.pubkeyHex);
          expect(derived.secretKey).toEqual(original.secretKey);
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('deriveKeypair', () => {
    it('is deterministic for same nsec', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const { nsec } = generateKeypair();
          const kp1 = deriveKeypair(nsec);
          const kp2 = deriveKeypair(nsec);

          expect(kp1.npub).toBe(kp2.npub);
          expect(kp1.pubkeyHex).toBe(kp2.pubkeyHex);
          expect(kp1.secretKey).toEqual(kp2.secretKey);
        }),
        { numRuns: 20 }
      );
    });

    it('produces valid format outputs', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const { nsec } = generateKeypair();
          const keypair = deriveKeypair(nsec);

          expect(keypair.npub).toMatch(/^npub1[a-z0-9]+$/);
          expect(keypair.pubkeyHex).toMatch(/^[0-9a-f]{64}$/);
          expect(keypair.secretKey).toHaveLength(32);
        }),
        { numRuns: 20 }
      );
    });

    it('throws on invalid nsec prefix', () => {
      expect(() => deriveKeypair('npub1invalidkey')).toThrow();
      expect(() => deriveKeypair('nsec')).toThrow();
      expect(() => deriveKeypair('')).toThrow();
    });

    it('throws on malformed bech32', () => {
      expect(() => deriveKeypair('nsec1!@#$%')).toThrow();
      expect(() => deriveKeypair('nsec1')).toThrow();
    });
  });

  describe('isValidNsec', () => {
    it('returns true for valid nsec strings', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const { nsec } = generateKeypair();
          expect(isValidNsec(nsec)).toBe(true);
        }),
        { numRuns: 20 }
      );
    });

    it('returns false for invalid inputs without throwing', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''),
            fc.constant('nsec'),
            fc.constant('nsec1'),
            fc.constant('npub1validbutnotnsec'),
            fc.string(),
            fc.constant('nsec1!@#$')
          ),
          (invalidInput) => {
            expect(isValidNsec(invalidInput)).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('is consistent with deriveKeypair success', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const { nsec } = generateKeypair();
          const isValid = isValidNsec(nsec);

          if (isValid) {
            expect(() => deriveKeypair(nsec)).not.toThrow();
          }
        }),
        { numRuns: 20 }
      );
    });

    it('never throws on any string input', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          expect(() => isValidNsec(input)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('isValidNpub', () => {
    it('returns true for valid npub strings', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const { keypair } = generateKeypair();
          expect(isValidNpub(keypair.npub)).toBe(true);
        }),
        { numRuns: 20 }
      );
    });

    it('returns false for invalid inputs without throwing', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''),
            fc.constant('npub'),
            fc.constant('npub1'),
            fc.constant('nsec1validbutnotnpub'),
            fc.string(),
            fc.constant('npub1!@#$')
          ),
          (invalidInput) => {
            expect(isValidNpub(invalidInput)).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
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

  describe('npubToHex and hexToNpub', () => {
    it('round-trip conversion preserves pubkey', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const { keypair } = generateKeypair();

          const hexFromNpub = npubToHex(keypair.npub);
          expect(hexFromNpub).toBe(keypair.pubkeyHex);

          const npubFromHex = hexToNpub(keypair.pubkeyHex);
          expect(npubFromHex).toBe(keypair.npub);

          const roundTrip = hexToNpub(npubToHex(keypair.npub));
          expect(roundTrip).toBe(keypair.npub);
        }),
        { numRuns: 20 }
      );
    });

    it('npubToHex produces 64-character hex string', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const { keypair } = generateKeypair();
          const hex = npubToHex(keypair.npub);

          expect(hex).toHaveLength(64);
          expect(hex).toMatch(/^[0-9a-f]{64}$/);
        }),
        { numRuns: 20 }
      );
    });

    it('hexToNpub produces valid npub format', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const { keypair } = generateKeypair();
          const npub = hexToNpub(keypair.pubkeyHex);

          expect(npub).toMatch(/^npub1[a-z0-9]+$/);
          expect(isValidNpub(npub)).toBe(true);
        }),
        { numRuns: 20 }
      );
    });

    it('npubToHex throws on invalid npub', () => {
      expect(() => npubToHex('invalid')).toThrow();
      expect(() => npubToHex('nsec1something')).toThrow();
      expect(() => npubToHex('')).toThrow();
    });

    it('hexToNpub throws on invalid hex', () => {
      expect(() => hexToNpub('invalid')).toThrow();
      expect(() => hexToNpub('abcd')).toThrow();
      expect(() => hexToNpub('g' + '0'.repeat(63))).toThrow();
      expect(() => hexToNpub('0'.repeat(63))).toThrow();
      expect(() => hexToNpub('0'.repeat(65))).toThrow();
    });
  });

  describe('encryptMessage and decryptMessage', () => {
    // Suppress expected console.warn messages from decryption failure tests
    let consoleWarnSpy: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('round-trip encryption preserves message', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (plaintext) => {
            const { keypair: sender } = generateKeypair();
            const { keypair: recipient } = generateKeypair();

            const ciphertext = await encryptMessage(
              plaintext,
              sender.secretKey,
              recipient.pubkeyHex
            );

            const decrypted = await decryptMessage(
              ciphertext,
              recipient.secretKey,
              sender.pubkeyHex
            );

            expect(decrypted).toBe(plaintext);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('encryption is non-deterministic', async () => {
      const plaintext = 'test message';
      const { keypair: sender } = generateKeypair();
      const { keypair: recipient } = generateKeypair();

      const ciphertext1 = await encryptMessage(
        plaintext,
        sender.secretKey,
        recipient.pubkeyHex
      );
      const ciphertext2 = await encryptMessage(
        plaintext,
        sender.secretKey,
        recipient.pubkeyHex
      );

      expect(ciphertext1).not.toBe(ciphertext2);

      const decrypted1 = await decryptMessage(
        ciphertext1,
        recipient.secretKey,
        sender.pubkeyHex
      );
      const decrypted2 = await decryptMessage(
        ciphertext2,
        recipient.secretKey,
        sender.pubkeyHex
      );

      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    it('ciphertext has NIP-04 format', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1 }), async (plaintext) => {
          const { keypair: sender } = generateKeypair();
          const { keypair: recipient } = generateKeypair();

          const ciphertext = await encryptMessage(
            plaintext,
            sender.secretKey,
            recipient.pubkeyHex
          );

          expect(ciphertext).toContain('?iv=');

          const [ctPart, ivPart] = ciphertext.split('?iv=');
          expect(ctPart.length).toBeGreaterThan(0);
          expect(ivPart.length).toBeGreaterThan(0);
        }),
        { numRuns: 20 }
      );
    });

    it('decryption fails gracefully with wrong recipient key', async () => {
      const plaintext = 'secret message';
      const { keypair: sender } = generateKeypair();
      const { keypair: recipient } = generateKeypair();
      const { keypair: wrongRecipient } = generateKeypair();

      const ciphertext = await encryptMessage(
        plaintext,
        sender.secretKey,
        recipient.pubkeyHex
      );

      const decrypted = await decryptMessage(
        ciphertext,
        wrongRecipient.secretKey,
        sender.pubkeyHex
      );

      expect(decrypted).toBeNull();
    });

    it('decryption fails gracefully with wrong sender key', async () => {
      const plaintext = 'secret message';
      const { keypair: sender } = generateKeypair();
      const { keypair: recipient } = generateKeypair();
      const { keypair: wrongSender } = generateKeypair();

      const ciphertext = await encryptMessage(
        plaintext,
        sender.secretKey,
        recipient.pubkeyHex
      );

      const decrypted = await decryptMessage(
        ciphertext,
        recipient.secretKey,
        wrongSender.pubkeyHex
      );

      expect(decrypted).toBeNull();
    });

    it('decryption returns null for malformed ciphertext', async () => {
      const { keypair: recipient } = generateKeypair();
      const { keypair: sender } = generateKeypair();

      const malformedCiphertexts = [
        'invalid',
        '',
        'no_iv_separator',
        'a?iv=',
        '?iv=b',
        'notbase64!@#?iv=notbase64!@#',
      ];

      for (const malformed of malformedCiphertexts) {
        const result = await decryptMessage(
          malformed,
          recipient.secretKey,
          sender.pubkeyHex
        );
        expect(result).toBeNull();
      }
    });

    it('preserves special characters and unicode', async () => {
      const specialMessages = [
        'Hello 世界',
        'Emoji test: 🚀💎🌈',
        'Special chars: !@#$%^&*()',
        'Newlines:\nand\ttabs',
        'Mixed: 日本語 with English and 123',
      ];

      const { keypair: sender } = generateKeypair();
      const { keypair: recipient } = generateKeypair();

      for (const message of specialMessages) {
        const ciphertext = await encryptMessage(
          message,
          sender.secretKey,
          recipient.pubkeyHex
        );
        const decrypted = await decryptMessage(
          ciphertext,
          recipient.secretKey,
          sender.pubkeyHex
        );

        expect(decrypted).toBe(message);
      }
    });
  });

  describe('buildKind4Event', () => {
    it('builds event with correct structure', async () => {
      const plaintext = 'test message';
      const { keypair: sender } = generateKeypair();
      const { keypair: recipient } = generateKeypair();

      const ciphertext = await encryptMessage(
        plaintext,
        sender.secretKey,
        recipient.pubkeyHex
      );

      const event = buildKind4Event(ciphertext, sender, recipient.pubkeyHex);

      expect(event.kind).toBe(4);
      expect(event.pubkey).toBe(sender.pubkeyHex);
      expect(event.content).toBe(ciphertext);
      expect(event.tags).toEqual([['p', recipient.pubkeyHex]]);
    });

    it('event has valid ID format', async () => {
      const { keypair: sender } = generateKeypair();
      const { keypair: recipient } = generateKeypair();

      const event = buildKind4Event('test', sender, recipient.pubkeyHex);

      expect(event.id).toMatch(/^[0-9a-f]{64}$/);
    });

    it('event has valid signature format', async () => {
      const { keypair: sender } = generateKeypair();
      const { keypair: recipient } = generateKeypair();

      const event = buildKind4Event('test', sender, recipient.pubkeyHex);

      expect(event.sig).toMatch(/^[0-9a-f]{128}$/);
    });

    it('created_at is reasonable Unix timestamp', async () => {
      const { keypair: sender } = generateKeypair();
      const { keypair: recipient } = generateKeypair();

      const beforeTime = Math.floor(Date.now() / 1000) - 1;
      const event = buildKind4Event('test', sender, recipient.pubkeyHex);
      const afterTime = Math.floor(Date.now() / 1000) + 1;

      expect(event.created_at).toBeGreaterThanOrEqual(beforeTime);
      expect(event.created_at).toBeLessThanOrEqual(afterTime);
    });

    it('same content produces different IDs due to timestamp', async () => {
      const content = 'same content';
      const { keypair: sender } = generateKeypair();
      const { keypair: recipient } = generateKeypair();

      const event1 = buildKind4Event(content, sender, recipient.pubkeyHex);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const event2 = buildKind4Event(content, sender, recipient.pubkeyHex);

      if (event1.created_at !== event2.created_at) {
        expect(event1.id).not.toBe(event2.id);
      }
    });

    it('recipient is tagged in event', async () => {
      await fc.assert(
        fc.asyncProperty(fc.nat({ max: 10 }), async () => {
          const { keypair: sender } = generateKeypair();
          const { keypair: recipient } = generateKeypair();

          const event = buildKind4Event('test', sender, recipient.pubkeyHex);

          const pTags = event.tags.filter((tag) => tag[0] === 'p');
          expect(pTags).toHaveLength(1);
          expect(pTags[0][1]).toBe(recipient.pubkeyHex);
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('Security properties', () => {
    it('secret keys never appear in error messages', () => {
      const { nsec, keypair } = generateKeypair();

      try {
        deriveKeypair('invalid_nsec');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage).not.toContain(nsec);
        expect(errorMessage).not.toContain(keypair.secretKey.toString());
      }
    });

    it('different keys produce different ciphertexts for same plaintext', async () => {
      const plaintext = 'identical message';
      const { keypair: sender1 } = generateKeypair();
      const { keypair: sender2 } = generateKeypair();
      const { keypair: recipient } = generateKeypair();

      const ciphertext1 = await encryptMessage(
        plaintext,
        sender1.secretKey,
        recipient.pubkeyHex
      );
      const ciphertext2 = await encryptMessage(
        plaintext,
        sender2.secretKey,
        recipient.pubkeyHex
      );

      expect(ciphertext1).not.toBe(ciphertext2);
    });
  });

  describe('Example-based edge cases', () => {
    it('handles empty string encryption', async () => {
      const { keypair: sender } = generateKeypair();
      const { keypair: recipient } = generateKeypair();

      const ciphertext = await encryptMessage('', sender.secretKey, recipient.pubkeyHex);
      const decrypted = await decryptMessage(
        ciphertext,
        recipient.secretKey,
        sender.pubkeyHex
      );

      expect(decrypted).toBe('');
    });

    it('handles very long messages', async () => {
      const longMessage = 'a'.repeat(10000);
      const { keypair: sender } = generateKeypair();
      const { keypair: recipient } = generateKeypair();

      const ciphertext = await encryptMessage(
        longMessage,
        sender.secretKey,
        recipient.pubkeyHex
      );
      const decrypted = await decryptMessage(
        ciphertext,
        recipient.secretKey,
        sender.pubkeyHex
      );

      expect(decrypted).toBe(longMessage);
    });
  });
});
