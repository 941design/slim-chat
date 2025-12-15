import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  page: Page;
};

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use, testInfo) => {
    // Create a unique data directory for this test to ensure isolation
    // This prevents identity/subscription accumulation across tests
    const testDataDir = path.join(
      process.env.NOSTLING_DATA_DIR || path.join(os.tmpdir(), 'nostling-e2e-data'),
      `test-${testInfo.testId}-${Date.now()}`
    );
    fs.mkdirSync(testDataDir, { recursive: true });

    const launchArgs = [path.join(__dirname, '../dist/main/index.js')];

    // Add flags for Linux CI to handle headless environment
    if (process.env.CI && process.platform === 'linux') {
      launchArgs.push(
        '--no-sandbox',              // Avoid chrome-sandbox permission issues
        '--disable-gpu',             // Disable GPU hardware acceleration in headless mode
        '--disable-dev-shm-usage'    // Use /tmp instead of /dev/shm in containerized environments
      );
    }

    const electronApp = await electron.launch({
      args: launchArgs,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        // Use isolated data directory for this test
        NOSTLING_DATA_DIR: testDataDir,
        ...(process.env.NOSTLING_DEV_RELAY && { NOSTLING_DEV_RELAY: process.env.NOSTLING_DEV_RELAY }),
      },
    });

    await use(electronApp);
    await electronApp.close();

    // Clean up test data directory after test completes
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  },

  page: async ({ electronApp }, use) => {
    // BUG FIX: Window creation timing - ensure window is fully loaded before use
    // Root cause: firstWindow() may return before DOM is ready
    // Bug report: bug-reports/window-creation-timing.md
    // Fixed: 2025-12-06
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect, Page } from '@playwright/test';
