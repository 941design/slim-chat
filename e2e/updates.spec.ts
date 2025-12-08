import { test, expect } from './fixtures';
import { waitForAppReady, getUpdatePhase, clickButton, waitForUpdatePhase, getStatusText } from './helpers';

test.describe('Update System', () => {
  test('should start with idle update state', async ({ page }) => {
    await waitForAppReady(page);

    const phase = await getUpdatePhase(page);
    expect(phase).toBe('idle');
  });

  test('should have correct button label for idle state', async ({ page }) => {
    await waitForAppReady(page);

    // New layout uses icon button with ↻ symbol for refresh
    const button = page.locator('.footer-icon-button');
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('title', 'Check for updates');
  });

  test('should display update status information', async ({ page }) => {
    await waitForAppReady(page);

    await expect(page.locator('.footer-status')).toBeVisible();
    const statusText = await getStatusText(page);
    // Idle state shows "Up to date"
    expect(statusText).toBe('Up to date');
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
    // Refresh button should be disabled during downloading
    const button = page.locator('.footer-icon-button');
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
    // Refresh button should be disabled during verifying
    const button = page.locator('.footer-icon-button');
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

    // New layout shows "Restart to Update" button in footer-right
    const restartButton = page.locator('.footer-button:has-text("Restart to Update")');
    await expect(restartButton).toBeVisible();

    // Status should show ready state with version
    const statusText = await getStatusText(page);
    expect(statusText).toContain('Update ready');
    expect(statusText).toContain('v1.0.1');
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

    // New layout shows version in footer status text
    const statusText = await getStatusText(page);
    expect(statusText).toContain('Update available');
    expect(statusText).toContain('v2.0.0');
  });
});
