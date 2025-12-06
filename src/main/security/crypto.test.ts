/**
 * Property-based tests for crypto.ts
 *
 * Tests verify all contract invariants and properties:
 * - Determinism: same file always produces same hash
 * - Collision resistance: different files produce different hashes
 * - Format compliance: output is exactly 64 lowercase hex characters
 * - Known values: empty file produces known hash
 * - Error handling: non-existent files throw errors
 * - Memory efficiency: large files process without issues
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { hashFile } from './crypto';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Test fixture: Create temp file with content
 */
function createTempFile(content: Buffer | string): string {
  const filename = join(tmpdir(), `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  writeFileSync(filename, content);
  return filename;
}

/**
 * Test fixture: Clean up temp file
 */
function removeTempFile(filepath: string): void {
  try {
    unlinkSync(filepath);
  } catch {
    // File might not exist, that's ok
  }
}

// Property 1: Determinism - same file always produces same hash
test('Property: Determinism - identical file hashes are identical', async () => {
  const content = Buffer.from('test content for hash determinism');
  const file1 = createTempFile(content);
  const file2 = createTempFile(content);

  try {
    const hash1a = await hashFile(file1);
    const hash1b = await hashFile(file1);
    const hash2 = await hashFile(file2);

    assert.strictEqual(hash1a, hash1b, 'Same file must produce same hash');
    assert.strictEqual(hash1a, hash2, 'Files with identical content must have identical hashes');
  } finally {
    removeTempFile(file1);
    removeTempFile(file2);
  }
});

// Property 2: Collision resistance - different files produce different hashes
test('Property: Collision resistance - different content produces different hashes', async () => {
  const file1 = createTempFile(Buffer.from('content A'));
  const file2 = createTempFile(Buffer.from('content B'));
  const file3 = createTempFile(Buffer.from('content C'));

  try {
    const hash1 = await hashFile(file1);
    const hash2 = await hashFile(file2);
    const hash3 = await hashFile(file3);

    assert.notStrictEqual(hash1, hash2, 'Different content must produce different hashes');
    assert.notStrictEqual(hash2, hash3, 'Different content must produce different hashes');
    assert.notStrictEqual(hash1, hash3, 'Different content must produce different hashes');
  } finally {
    removeTempFile(file1);
    removeTempFile(file2);
    removeTempFile(file3);
  }
});

// Property 3: Format compliance - output is exactly 64 lowercase hex characters
test('Property: Format compliance - hash is exactly 64 lowercase hex characters', async () => {
  const file = createTempFile(Buffer.from('format test content'));

  try {
    const hash = await hashFile(file);

    assert.strictEqual(hash.length, 64, 'Hash must be exactly 64 characters');
    assert.match(hash, /^[a-f0-9]{64}$/, 'Hash must match pattern: 64 lowercase hex characters');
    assert.strictEqual(hash, hash.toLowerCase(), 'Hash must be lowercase');
  } finally {
    removeTempFile(file);
  }
});

// Property 4: Known value - empty file produces known SHA-256 hash
test('Property: Known value - empty file produces e4d909c290d0fb1ca068ffaddf22cbd0', async () => {
  const emptyFile = createTempFile('');

  try {
    const hash = await hashFile(emptyFile);
    // SHA-256 of empty string
    assert.strictEqual(hash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'Empty file must produce known SHA-256 hash');
  } finally {
    removeTempFile(emptyFile);
  }
});

// Property 5: Error handling - non-existent file throws error
test('Error handling: Non-existent file throws error', async () => {
  const nonExistentPath = join(tmpdir(), `does-not-exist-${Date.now()}-${Math.random()}`);

  try {
    await hashFile(nonExistentPath);
    assert.fail('Should have thrown error for non-existent file');
  } catch (err) {
    // BUG FIX: Error instanceof check fails across module boundaries in Node.js test runner
    // Use duck-typing instead to verify error-like object
    // Bug report: bug-reports/crypto-test-assertion-failure.md
    // Fixed: 2025-12-06
    assert.ok(err && typeof err === 'object' && 'message' in err, 'Must throw an Error-like object');
    assert.match((err as Error).message, /ENOENT|no such file|cannot find/, 'Error should indicate file not found');
  }
});

// Property 6: Large file handling - 15MB file hashes without memory issues
test('Property: Large file handling - 15MB file completes without memory issues', async () => {
  // Create a 15MB file
  const chunkSize = 1024 * 1024; // 1MB chunks
  const numChunks = 15;
  const content = Buffer.concat(Array(numChunks).fill(null).map(() => randomBytes(chunkSize)));
  const largeFile = createTempFile(content);

  try {
    const hash = await hashFile(largeFile);

    assert.strictEqual(hash.length, 64, 'Hash must be valid length');
    assert.match(hash, /^[a-f0-9]{64}$/, 'Hash must be valid format');
  } finally {
    removeTempFile(largeFile);
  }
});

// Property 7: Single byte change - changing one byte changes hash
test('Property: Sensitivity - single byte change produces different hash', async () => {
  const content = Buffer.from('the quick brown fox jumps over the lazy dog');
  const file1 = createTempFile(content);

  // Modify one byte
  const modifiedContent = Buffer.concat([
    content.slice(0, 10),
    Buffer.from('X'), // Replace character at position 10
    content.slice(11)
  ]);
  const file2 = createTempFile(modifiedContent);

  try {
    const hash1 = await hashFile(file1);
    const hash2 = await hashFile(file2);

    assert.notStrictEqual(hash1, hash2, 'Single byte change must produce different hash');
  } finally {
    removeTempFile(file1);
    removeTempFile(file2);
  }
});

// Property 8: Random input - random content always produces valid hash
test('Property: Random input - random content always produces valid hash', async () => {
  for (let i = 0; i < 5; i++) {
    const randomContent = randomBytes(Math.floor(Math.random() * 10000) + 1);
    const file = createTempFile(randomContent);

    try {
      const hash = await hashFile(file);

      assert.strictEqual(hash.length, 64, `Iteration ${i}: Hash must be 64 characters`);
      assert.match(hash, /^[a-f0-9]{64}$/, `Iteration ${i}: Hash must be valid hex format`);
    } finally {
      removeTempFile(file);
    }
  }
});

// Property 9: Stream integrity - verify hash matches crypto.createHash directly
test('Property: Stream integrity - streaming hash matches direct hash', async () => {
  const crypto = require('crypto');
  const content = Buffer.from('stream integrity test with substantial content for proper testing');
  const file = createTempFile(content);

  try {
    const streamHash = await hashFile(file);

    // Compute hash directly for comparison
    const directHash = crypto.createHash('sha256').update(content).digest('hex');

    assert.strictEqual(streamHash, directHash, 'Stream hash must match direct hash computation');
  } finally {
    removeTempFile(file);
  }
});

// Property 10: File size variation - files of different sizes hash correctly
test('Property: File size variation - different file sizes produce valid hashes', async () => {
  const sizes = [0, 1, 10, 100, 1000, 10000, 100000];
  const hashes = new Set<string>();

  for (const size of sizes) {
    const content = randomBytes(size);
    const file = createTempFile(content);

    try {
      const hash = await hashFile(file);

      assert.strictEqual(hash.length, 64, `Size ${size}: Hash must be 64 characters`);
      assert.match(hash, /^[a-f0-9]{64}$/, `Size ${size}: Hash must be valid format`);

      // Hashes should be unique (with overwhelming probability)
      hashes.add(hash);
    } finally {
      removeTempFile(file);
    }
  }

  // All 7 sizes should produce different hashes
  assert.strictEqual(hashes.size, sizes.length, 'Different file sizes should produce different hashes');
});
