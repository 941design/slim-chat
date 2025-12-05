import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import nacl from 'tweetnacl';

const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
const distDir = path.resolve('dist');
const manifestPath = path.join(distDir, 'manifest.json');
const privateKey = process.env.ED25519_PRIVATE_KEY;

if (!privateKey) {
  throw new Error('ED25519_PRIVATE_KEY environment variable is required to sign manifest');
}

const ARTIFACT_EXTS = ['.AppImage', '.dmg', '.zip'];

function hashFile(filePath: string): string {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

const files = fs
  .readdirSync(distDir)
  .filter((file) => ARTIFACT_EXTS.some((ext) => file.endsWith(ext)))
  .map((file) => ({
    url: file,
    sha512: hashFile(path.join(distDir, file)),
  }));

const manifest = {
  version: packageJson.version,
  files,
};

const signature = nacl.sign.detached(
  Buffer.from(JSON.stringify(manifest)),
  Buffer.from(privateKey, 'base64')
);

const signedManifest = { ...manifest, signature: Buffer.from(signature).toString('base64') };

fs.writeFileSync(manifestPath, JSON.stringify(signedManifest, null, 2));
console.log(`Manifest written to ${manifestPath}`);
