/**
 * RSA-based manifest generation script (migration from Ed25519)
 *
 * Generates signed manifest.json during CI/CD build.
 * Reads RSA private key from environment variable NOSTLING_RSA_PRIVATE_KEY.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SignedManifest, ManifestArtifact } from '../src/shared/types';

/**
 * Hash file using SHA-256
 *
 * CONTRACT:
 *   Inputs:
 *     - filePath: absolute path to file to hash
 *
 *   Outputs:
 *     - string: SHA-256 hash in lowercase hexadecimal format (64 characters)
 *
 *   Invariants:
 *     - Uses SHA-256 algorithm (not SHA-512 as in old Ed25519 script)
 *     - Output format is lowercase hexadecimal
 *     - Same file always produces same hash
 *
 *   Properties:
 *     - Deterministic: same file content produces same hash
 *     - Collision-resistant: different files produce different hashes
 *
 *   Algorithm:
 *     1. Create SHA-256 hash object: crypto.createHash('sha256')
 *     2. Read file contents synchronously
 *     3. Update hash with file contents
 *     4. Compute digest in hexadecimal format
 *     5. Return hex string
 *
 *   Error Conditions:
 *     - File doesn't exist: throw filesystem error
 *     - File not readable: throw filesystem error
 */
function hashFile(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

interface UnsignedManifest {
  version: string;
  artifacts: ManifestArtifact[];
  createdAt: string;
}

/**
 * Generate RSA-signed manifest from artifacts in dist/ directory
 *
 * CONTRACT:
 *   Inputs:
 *     - Environment: NOSTLING_RSA_PRIVATE_KEY (RSA private key in PEM format)
 *     - Filesystem: package.json (for version), dist/ directory (for artifacts)
 *
 *   Outputs:
 *     - File: dist/manifest.json (signed manifest)
 *     - Return: void
 *
 *   Invariants:
 *     - Only processes artifacts with extensions: .AppImage, .dmg, .zip
 *     - Uses SHA-256 for both file hashing and RSA signing
 *     - Manifest structure: { version, artifacts: [{ url, sha256, platform, type }], createdAt, signature }
 *     - Signature covers { version, artifacts, createdAt } as canonical JSON
 *     - Platform detection: .dmg→darwin, .AppImage→linux, .zip→inferred from filename or darwin
 *
 *   Error Conditions:
 *     - NOSTLING_RSA_PRIVATE_KEY missing: throw error
 *     - package.json missing/invalid: throw error
 *     - dist/ directory missing: throw error
 *     - Invalid PEM format in private key: throw error
 *     - Unsupported artifact extension: throw error
 */
function generateManifest(): void {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const version = packageJson.version;
  const distDir = path.resolve('dist');
  const manifestPath = path.join(distDir, 'manifest.json');
  const privateKey = process.env.NOSTLING_RSA_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('NOSTLING_RSA_PRIVATE_KEY environment variable is required to sign manifest');
  }

  // List files in dist directory
  const entries = fs.readdirSync(distDir);

  // Filter for recognized artifact types
  const artifactExtensions = ['.AppImage', '.dmg', '.zip'];
  const artifacts = entries.filter((file) => {
    const ext = path.extname(file);
    return artifactExtensions.includes(ext);
  });

  // Create artifact entries with SHA-256 hashes and platform/type metadata
  const artifactEntries: ManifestArtifact[] = artifacts.map((filename) => {
    const filePath = path.join(distDir, filename);
    const sha256 = hashFile(filePath);
    const ext = path.extname(filename);

    // Determine platform and type from extension
    let platform: 'darwin' | 'linux' | 'win32';
    let type: 'dmg' | 'zip' | 'AppImage' | 'exe';

    if (ext === '.dmg') {
      platform = 'darwin';
      type = 'dmg';
    } else if (ext === '.AppImage') {
      platform = 'linux';
      type = 'AppImage';
    } else if (ext === '.zip') {
      // Determine platform from filename (e.g., Nostling-1.0.0-win.zip)
      if (filename.includes('-mac') || filename.includes('-darwin')) {
        platform = 'darwin';
      } else if (filename.includes('-win')) {
        platform = 'win32';
      } else {
        // Default to darwin for .zip if not specified
        platform = 'darwin';
      }
      type = 'zip';
    } else {
      throw new Error(`Unsupported artifact extension: ${ext}`);
    }

    return {
      url: filename,
      sha256,
      platform,
      type,
    };
  });

  // Create unsigned manifest
  const unsigned: UnsignedManifest = {
    version,
    artifacts: artifactEntries,
    createdAt: new Date().toISOString(),
  };

  // Sign manifest using RSA
  const canonicalJson = JSON.stringify(unsigned, null, 0);
  const signer = crypto.createSign('SHA256');
  signer.update(canonicalJson);
  const signature = signer.sign(privateKey, 'base64');

  // Create signed manifest
  const signed: SignedManifest = {
    ...unsigned,
    signature,
  };

  // Write to manifest.json with pretty-printing
  fs.writeFileSync(manifestPath, JSON.stringify(signed, null, 2));

  console.log(`Manifest signed and written to ${manifestPath}`);
}

// Run the script
generateManifest();
