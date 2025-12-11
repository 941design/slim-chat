import { defineConfig } from 'tsup';
import fs from 'fs';
import path from 'path';

// Read public key at build time - embedded into bundle
const publicKeyPath = path.resolve(__dirname, 'keys/nostling-release.pub');
const publicKey = fs.existsSync(publicKeyPath)
  ? fs.readFileSync(publicKeyPath, 'utf-8').trim()
  : '';

export default defineConfig({
  external: [
    'electron',
    'electron-updater',
    'electron-log',
  ],
  define: {
    'process.env.EMBEDDED_RSA_PUBLIC_KEY': JSON.stringify(publicKey),
  },
});
