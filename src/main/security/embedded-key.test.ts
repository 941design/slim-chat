/**
 * Tests for embedded RSA public key validity
 *
 * Ensures the build-time embedded public key is valid and matches
 * the signing key used for manifest generation.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Read the public key file directly (same source as tsup.config.ts)
const PUBLIC_KEY_PATH = path.resolve(__dirname, '../../../keys/nostling-release.pub');
const PUBLIC_KEY = fs.existsSync(PUBLIC_KEY_PATH)
  ? fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8').trim()
  : '';

describe('Embedded RSA Public Key', () => {
  test('public key file exists', () => {
    expect(fs.existsSync(PUBLIC_KEY_PATH)).toBe(true);
  });

  test('public key is not empty', () => {
    expect(PUBLIC_KEY.length).toBeGreaterThan(0);
  });

  test('public key has valid PEM format', () => {
    expect(PUBLIC_KEY).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(PUBLIC_KEY).toMatch(/-----END PUBLIC KEY-----$/);
  });

  test('public key can be parsed by Node crypto', () => {
    expect(() => {
      crypto.createPublicKey(PUBLIC_KEY);
    }).not.toThrow();
  });

  test('public key is RSA with sufficient key size (>= 2048 bits)', () => {
    const keyObject = crypto.createPublicKey(PUBLIC_KEY);
    const keyDetails = keyObject.asymmetricKeyDetails;

    expect(keyObject.asymmetricKeyType).toBe('rsa');
    expect(keyDetails?.modulusLength).toBeGreaterThanOrEqual(2048);
  });

  test('public key can verify signatures', () => {
    // Create a test signature with a throwaway key to verify the public key
    // can at least be used in verification operations (will return false, but shouldn't throw)
    const testData = Buffer.from('test data');
    const fakeSignature = Buffer.alloc(512); // Fake signature bytes

    const verifier = crypto.createVerify('SHA256');
    verifier.update(testData);

    // Should not throw, just return false for invalid signature
    expect(() => {
      verifier.verify(PUBLIC_KEY, fakeSignature);
    }).not.toThrow();
  });

  // This test only runs when the private key is available (CI environment)
  const privateKey = process.env.NOSTLING_RSA_PRIVATE_KEY;
  const describeIfPrivateKey = privateKey ? describe : describe.skip;

  describeIfPrivateKey('Key pair matching (requires NOSTLING_RSA_PRIVATE_KEY)', () => {
    test('public key matches the signing private key', () => {
      const testPayload = JSON.stringify({
        version: '1.0.0',
        artifacts: [],
        createdAt: new Date().toISOString(),
      });

      // Sign with private key
      const signer = crypto.createSign('SHA256');
      signer.update(testPayload);
      const signature = signer.sign(privateKey!, 'base64');

      // Verify with public key
      const verifier = crypto.createVerify('SHA256');
      verifier.update(testPayload);
      const isValid = verifier.verify(PUBLIC_KEY, Buffer.from(signature, 'base64'));

      expect(isValid).toBe(true);
    });
  });
});
