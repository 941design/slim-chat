import { test, expect } from './fixtures';
import { waitForAppReady, getAppVersion, getUpdatePhase } from './helpers';

test.describe('SlimChat Application', () => {
  test('should launch application successfully', async ({ page }) => {
    await waitForAppReady(page);
    await expect(page.locator('.brand')).toHaveText('SlimChat Bootstrap');
  });

  test('should display application header and footer', async ({ page }) => {
    await waitForAppReady(page);

    await expect(page.locator('.app-header')).toBeVisible();
    await expect(page.locator('.brand')).toHaveText('SlimChat Bootstrap');
    await expect(page.locator('.subtitle')).toHaveText('Secure auto-update shell');

    await expect(page.locator('.app-footer')).toBeVisible();
    await expect(page.locator('.app-footer .mono')).toHaveText('Ed25519 manifest verification enabled');
  });

  test('should display version information', async ({ page }) => {
    await waitForAppReady(page);

    const version = await getAppVersion(page);
    expect(version).toBeTruthy();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('should display status dashboard', async ({ page }) => {
    await waitForAppReady(page);

    await expect(page.locator('h2:has-text("Status dashboard")')).toBeVisible();
    await expect(page.locator('.card-title:has-text("Version")')).toBeVisible();
    await expect(page.locator('.card-title:has-text("Platform")')).toBeVisible();
    await expect(page.locator('.card-title:has-text("Last update check")')).toBeVisible();
  });

  test('should display sidebar with update status', async ({ page }) => {
    await waitForAppReady(page);

    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.sidebar h3:has-text("Status")')).toBeVisible();

    const phase = await getUpdatePhase(page);
    expect(['idle', 'checking', 'available', 'downloading', 'downloaded', 'verifying', 'ready', 'failed']).toContain(phase);
  });

  test('should have check for updates button', async ({ page }) => {
    await waitForAppReady(page);

    const button = page.locator('button.primary');
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });

  test('should display log panel', async ({ page }) => {
    await waitForAppReady(page);

    await expect(page.locator('.log-panel')).toBeVisible();
    await expect(page.locator('h3:has-text("Recent update logs")')).toBeVisible();
  });

  test('should display platform information correctly', async ({ page }) => {
    await waitForAppReady(page);

    const platformCard = page.locator('.card-title:has-text("Platform")').locator('..');
    const platformValue = await platformCard.locator('.card-value').textContent();

    expect(['darwin', 'linux', 'win32']).toContain(platformValue);
  });
});
