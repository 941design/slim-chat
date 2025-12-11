import { test, expect } from './fixtures';
import { waitForAppReady, getAppVersion, getUpdatePhase } from './helpers';

test.describe('Nostling Application', () => {
  test('should launch application successfully', async ({ page }) => {
    await waitForAppReady(page);
    await expect(page.locator('.brand')).toHaveText('Nostling');
  });

  test('should display application header and footer', async ({ page }) => {
    await waitForAppReady(page);

    await expect(page.locator('.app-header')).toBeVisible();
    await expect(page.locator('.brand')).toHaveText('Nostling');

    await expect(page.locator('.app-footer')).toBeVisible();
  });

  test('should display version information', async ({ page }) => {
    await waitForAppReady(page);

    const version = await getAppVersion(page);
    expect(version).toBeTruthy();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('should display sidebar and footer with update status', async ({ page }) => {
    await waitForAppReady(page);

    // Sidebar is present (placeholder for future features)
    await expect(page.locator('.sidebar')).toBeVisible();

    // Update status is shown in footer, not sidebar
    await expect(page.locator('.footer-status')).toBeVisible();

    const phase = await getUpdatePhase(page);
    expect(['idle', 'checking', 'available', 'downloading', 'downloaded', 'verifying', 'ready', 'failed']).toContain(phase);
  });

  test('should have check for updates button', async ({ page }) => {
    await waitForAppReady(page);

    // New layout uses icon button in footer for refresh
    const button = page.locator('.footer-icon-button');
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });
});
