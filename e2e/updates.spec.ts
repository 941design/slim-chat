import { test, expect } from './fixtures';
import { waitForAppReady, getUpdatePhase, clickButton, waitForUpdatePhase } from './helpers';

test.describe('Update System', () => {
  test('should start with idle update state', async ({ page }) => {
    await waitForAppReady(page);

    const phase = await getUpdatePhase(page);
    expect(phase).toBe('idle');
  });

  test('should have correct button label for idle state', async ({ page }) => {
    await waitForAppReady(page);

    const button = page.locator('button.primary');
    await expect(button).toHaveText('Check for updates');
  });

  test('should display update status information', async ({ page }) => {
    await waitForAppReady(page);

    await expect(page.locator('.update-phase')).toBeVisible();
    const statusText = await page.locator('.update-phase').textContent();
    expect(statusText).toContain('Update:');
  });

  test('should have sidebar footer with security information', async ({ page }) => {
    await waitForAppReady(page);

    await expect(page.locator('.sidebar-footer')).toBeVisible();
    await expect(page.locator('.sidebar-footer .small:has-text("Updates served via GitHub Releases")')).toBeVisible();
    await expect(page.locator('.sidebar-footer .small:has-text("Manifest signature required")')).toBeVisible();
  });

  test('should show last update check as not yet checked initially', async ({ page }) => {
    await waitForAppReady(page);

    const lastCheckCard = page.locator('.card-title:has-text("Last update check")').locator('..');
    const lastCheckValue = await lastCheckCard.locator('.card-value').textContent();

    expect(lastCheckValue).toBeTruthy();
  });

  test('button should be disabled during downloading state', async ({ page, electronApp }) => {
    await waitForAppReady(page);

    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows[0]) {
        windows[0].webContents.send('update-state', { phase: 'downloading' });
      }
    });

    await waitForUpdatePhase(page, 'downloading');
    const button = page.locator('button.primary');
    await expect(button).toBeDisabled();
  });

  test('button should be disabled during verifying state', async ({ page, electronApp }) => {
    await waitForAppReady(page);

    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows[0]) {
        windows[0].webContents.send('update-state', { phase: 'verifying' });
      }
    });

    await waitForUpdatePhase(page, 'verifying');
    const button = page.locator('button.primary');
    await expect(button).toBeDisabled();
  });

  test('should show restart button when update is ready', async ({ page, electronApp }) => {
    await waitForAppReady(page);

    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows[0]) {
        windows[0].webContents.send('update-state', { phase: 'ready', version: '1.0.1' });
      }
    });

    await waitForUpdatePhase(page, 'ready');

    const primaryButton = page.locator('button.primary');
    await expect(primaryButton).toHaveText('Restart to apply');

    const secondaryButton = page.locator('button.secondary');
    await expect(secondaryButton).toBeVisible();
    await expect(secondaryButton).toHaveText('Restart now');
  });

  test('should display version in update detail when available', async ({ page, electronApp }) => {
    await waitForAppReady(page);

    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows[0]) {
        windows[0].webContents.send('update-state', {
          phase: 'available',
          version: '2.0.0'
        });
      }
    });

    await waitForUpdatePhase(page, 'available');

    const detail = await page.locator('.sidebar-section .muted').textContent();
    expect(detail).toBe('2.0.0');
  });
});
