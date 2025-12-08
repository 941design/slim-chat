/**
 * Footer display tests
 *
 * Tests verify the footer component displays correctly:
 * - Version display
 * - Status text display
 * - Refresh button visibility and state
 *
 * Note: Timestamp display was removed from the UI in a layout update.
 *       These tests now verify the new footer layout.
 */
import { test, expect } from './fixtures';
import { waitForAppReady, getAppVersion, getStatusText } from './helpers';

test.describe('Footer Display', () => {
  test('should display version on start', async ({ page }) => {
    await waitForAppReady(page);

    const footer = page.locator('.app-footer');
    await expect(footer).toBeVisible();

    // Version should be displayed in footer-version
    const versionSpan = footer.locator('.footer-version');
    await expect(versionSpan).toBeVisible();

    const version = await getAppVersion(page);
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('should display status text in footer', async ({ page }) => {
    await waitForAppReady(page);

    const footer = page.locator('.app-footer');

    // Status should be displayed in footer-status
    const statusSpan = footer.locator('.footer-status');
    await expect(statusSpan).toBeVisible();

    // Initial state should be "Up to date"
    const statusText = await getStatusText(page);
    expect(statusText).toBe('Up to date');
  });

  test('should have refresh button enabled on idle state', async ({ page }) => {
    await waitForAppReady(page);

    const footer = page.locator('.app-footer');

    // Refresh button should be visible and enabled
    const refreshButton = footer.locator('.footer-icon-button');
    await expect(refreshButton).toBeVisible();
    await expect(refreshButton).toBeEnabled();
    await expect(refreshButton).toHaveAttribute('title', 'Check for updates');
  });
});
