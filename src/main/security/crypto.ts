/**
 * GAP-001: Cryptographic hash operations using SHA-256
 *
 * This module provides hash computation functions for artifact verification.
 * All hash operations MUST use SHA-256 algorithm (not SHA-512).
 */

import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Compute SHA-256 hash of a file
 *
 * CONTRACT:
 *   Inputs:
 *     - filePath: absolute path to file, string, file must exist and be readable
 *
 *   Outputs:
 *     - promise resolving to: hexadecimal string, lowercase, exactly 64 characters (SHA-256 hash)
 *
 *   Invariants:
 *     - Same file content produces identical hash
 *     - Hash length is always 64 hex characters (32 bytes * 2)
 *     - Uses SHA-256 algorithm exclusively
 *
 *   Properties:
 *     - Deterministic: hashFile(path) at time T1 equals hashFile(path) at time T2 if file unchanged
 *     - Collision resistant: different file contents produce different hashes (with overwhelming probability)
 *     - Format: output matches regex ^[a-f0-9]{64}$
 *
 *   Algorithm:
 *     1. Create SHA-256 hash instance
 *     2. Open file as readable stream
 *     3. For each chunk of file data:
 *        a. Update hash with chunk
 *     4. When stream ends, finalize hash
 *     5. Convert to hexadecimal lowercase string
 *     6. Return hash string
 *
 *   Error Conditions:
 *     - File not found: reject with filesystem error
 *     - File not readable: reject with permission error
 *     - Stream error: reject with I/O error
 */
export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    // BUG FIX: Attach error handler BEFORE data/end handlers
    // Root cause: Error events during stream initialization were not caught
    // Bug report: bug-reports/unhandled-rejection-hash-file.md
    // Date: 2025-12-06
    stream.on('error', (err) => {
      reject(err);
    });

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}

/**
 * Compare two hash strings for equality (case-insensitive)
 *
 * CONTRACT:
 *   Inputs:
 *     - hash1: hexadecimal string, SHA-256 hash (64 characters)
 *     - hash2: hexadecimal string, SHA-256 hash (64 characters)
 *
 *   Outputs:
 *     - boolean: true if hashes match (case-insensitive), false otherwise
 *
 *   Invariants:
 *     - Case insensitive comparison
 *     - Commutative: hashMatches(a, b) equals hashMatches(b, a)
 *
 *   Properties:
 *     - Identity: hashMatches(h, h) is always true
 *     - Commutative: hashMatches(h1, h2) equals hashMatches(h2, h1)
 *     - Case insensitive: hashMatches("ABC", "abc") is true
 *
 *   Algorithm:
 *     1. Convert both inputs to lowercase
 *     2. Compare strings for exact equality
 *     3. Return comparison result
 */
export function hashMatches(hash1: string, hash2: string): boolean {
  // TRIVIAL: Implemented directly
  return hash1.toLowerCase() === hash2.toLowerCase();
}
