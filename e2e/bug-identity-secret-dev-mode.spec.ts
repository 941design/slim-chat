/**
 * E2E Test: Identity Secret Loading in Dev Mode
 *
 * Bug report: bug-reports/identity-secret-loading-dev-mode-report.md
 *
 * Reproduces the bug where updating identity profiles fails after app restart
 * in dev mode with persisted data due to safeStorage encryption key changes.
 *
 * Expected: Identity secrets should be retrievable across app restarts
 * Actual: Secret loading fails with "Failed to load identity secret"
 */

import { test as base, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

let testDataDir: string;

/**
 * Helper to build launch args with proper flags for Docker/Linux CI
 */
function buildLaunchArgs(): string[] {
  const args: string[] = [];

  // Add flags for Linux CI to handle headless environment
  // These MUST be added before the main entry point
  const isLinuxCI = process.env.CI || process.platform === 'linux';

  if (isLinuxCI) {
    args.push(
      '--no-sandbox',              // Avoid chrome-sandbox permission issues
      '--disable-gpu',             // Disable GPU hardware acceleration in headless mode
      '--disable-dev-shm-usage',   // Use /tmp instead of /dev/shm in containerized environments
      '--password-store=gnome-libsecret'  // Use gnome-keyring for secure storage
    );
  }

  // Main entry script must come AFTER all flags
  args.push(path.join(__dirname, '../dist/main/index.js'));

  return args;
}

/**
 * Helper to wait for app shell to be ready
 */
async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('.app-shell', { timeout: 10000 });
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Helper to create an identity using the UI
 */
async function createIdentity(page: Page, label: string): Promise<string> {
  // Hover the identity list to reveal the + button
  await page.locator('[data-testid="identity-list"]').hover();

  // Click the + button to open identity modal
  await page.locator('button[aria-label="Create identity"]').click();

  // Wait for modal to appear
  await page.waitForSelector('text=Create or Import Identity', { timeout: 5000 });

  // Fill in the label
  await page.locator('input[placeholder="Personal account"]').fill(label);

  // Click Save button
  await page.locator('button:has-text("Save")').click();

  // Wait for modal to close
  await page.waitForSelector('text=Create or Import Identity', { state: 'hidden', timeout: 5000 });

  // Wait for identity item to appear in sidebar
  const identityItem = page.locator('[data-testid^="identity-item-"]').first();
  await identityItem.waitFor({ state: 'visible', timeout: 5000 });

  // Get the identity ID from the data-testid
  const testId = await identityItem.getAttribute('data-testid');
  const identityId = testId?.replace('identity-item-', '') || '';

  return identityId;
}

base.describe('Bug: Identity secret loading in dev mode', () => {
  base.beforeAll(async () => {
    // Create temporary data directory for this test
    testDataDir = path.join(
      process.env.NOSTLING_DATA_DIR || os.tmpdir(),
      `nostling-bug-test-${Date.now()}`
    );
    fs.mkdirSync(testDataDir, { recursive: true });
  });

  base.afterAll(async () => {
    // Cleanup
    if (testDataDir && fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  base('identity secret should persist across app restarts in dev mode', async () => {
    let app: ElectronApplication;
    let mainWindow: Page;
    let identityId: string;

    // ========================================================================
    // FIRST RUN: Create identity with private key
    // ========================================================================

    const launchEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      NODE_ENV: 'development',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      NOSTLING_DATA_DIR: testDataDir,
    };

    if (process.env.NOSTLING_DEV_RELAY) {
      launchEnv.NOSTLING_DEV_RELAY = process.env.NOSTLING_DEV_RELAY;
    }

    app = await electron.launch({
      args: buildLaunchArgs(),
      env: launchEnv,
    });

    try {
      mainWindow = await app.firstWindow();
      await waitForAppReady(mainWindow);

      // Create a new identity
      identityId = await createIdentity(mainWindow, 'Bug Test Identity');
      expect(identityId).toBeTruthy();

      // Select the identity
      await mainWindow.locator(`[data-testid="identity-item-${identityId}"]`).click();

      // Open identities panel to edit profile
      await mainWindow.locator('button[aria-label="Open menu"]').click();
      await mainWindow.locator('[data-testid="identities-panel-trigger"]').click();

      // Wait for panel to open
      const panel = mainWindow.locator('[data-testid="identities-panel"]');
      await expect(panel).toBeVisible({ timeout: 5000 });

      // Edit the profile name
      const nameInput = mainWindow.locator('[data-testid="profile-editor-name"]');
      await nameInput.fill('Test Identity First Run');

      // Click Apply to save changes
      const applyButton = mainWindow.locator('[data-testid="identities-panel-apply"]');
      await applyButton.click();

      // Wait for panel to close (indicates success)
      await expect(panel).not.toBeVisible({ timeout: 5000 });

    } finally {
      // Close the app
      await app.close();
    }

    // ========================================================================
    // SECOND RUN: Restart app with persisted data
    // ========================================================================

    // Wait a bit to ensure clean shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));

    app = await electron.launch({
      args: buildLaunchArgs(),
      env: launchEnv,
    });

    try {
      mainWindow = await app.firstWindow();
      await waitForAppReady(mainWindow);

      // Verify identity still exists in sidebar
      const identityItem = mainWindow.locator(`[data-testid="identity-item-${identityId}"]`);
      await identityItem.waitFor({ state: 'visible', timeout: 5000 });

      // Select the identity
      await identityItem.click();

      // Open identities panel to edit profile
      await mainWindow.locator('button[aria-label="Open menu"]').click();
      await mainWindow.locator('[data-testid="identities-panel-trigger"]').click();

      // Wait for panel to open
      const panel = mainWindow.locator('[data-testid="identities-panel"]');
      await expect(panel).toBeVisible({ timeout: 5000 });

      // Try to edit the profile again (this should trigger secret loading)
      const nameInput = mainWindow.locator('[data-testid="profile-editor-name"]');
      await nameInput.fill('Test Identity After Restart');

      // Click Apply to save changes
      // BUG: This may fail with "Failed to load identity secret" if encryption keys changed
      const applyButton = mainWindow.locator('[data-testid="identities-panel-apply"]');
      await applyButton.click();

      // Wait for panel to close (indicates success)
      // When bug is fixed, this should complete successfully
      await expect(panel).not.toBeVisible({ timeout: 5000 });

    } finally {
      await app.close();
    }
  });
});
