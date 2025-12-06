import { defineConfig } from 'tsup';

export default defineConfig({
  external: [
    'electron',
    'electron-updater',
    'electron-log',
  ],
});
