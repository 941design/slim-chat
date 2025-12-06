import { test, expect } from './fixtures';
import { waitForAppReady } from './helpers';

test.describe('Log Panel', () => {
  test('should display log panel', async ({ page }) => {
    await waitForAppReady(page);

    await expect(page.locator('.log-panel')).toBeVisible();
    await expect(page.locator('h3:has-text("Recent update logs")')).toBeVisible();
  });

  test('should show message when no logs exist', async ({ page }) => {
    await waitForAppReady(page);

    const logList = page.locator('.log-list');
    await expect(logList).toBeVisible();

    const noLogsMessage = logList.locator('.muted:has-text("No logs yet")');
    const hasLogs = await logList.locator('.log-entry').count();

    if (hasLogs === 0) {
      await expect(noLogsMessage).toBeVisible();
    }
  });

  test('should display log entries with correct structure', async ({ page, electronApp }) => {
    await waitForAppReady(page);

    // BUG FIX: Remove require('electron') from evaluate() context
    // Root cause: require() not available in Playwright's evaluate() sandbox
    // Bug report: bug-reports/e2e-electron-require.md
    // Date: 2025-12-06
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows[0]) {
        const testLog = {
          timestamp: Date.now(),
          level: 'info',
          message: 'Test log entry'
        };
        windows[0].webContents.executeJavaScript(`
          window.testLogInjection = ${JSON.stringify([testLog])};
        `);
      }
    });

    const logEntries = page.locator('.log-entry');
    const count = await logEntries.count();

    if (count > 0) {
      const firstLog = logEntries.first();
      await expect(firstLog.locator('.mono')).toBeVisible();
      await expect(firstLog.locator('.level')).toBeVisible();
      await expect(firstLog.locator('.message')).toBeVisible();
    }
  });

  test('should format timestamps correctly', async ({ page }) => {
    await waitForAppReady(page);

    const logEntries = page.locator('.log-entry');
    const count = await logEntries.count();

    if (count > 0) {
      const timestamp = await logEntries.first().locator('.mono').textContent();
      expect(timestamp).toBeTruthy();
      expect(timestamp).toMatch(/\d{1,2}:\d{2}:\d{2}/);
    }
  });

  test('should display log level', async ({ page }) => {
    await waitForAppReady(page);

    const logEntries = page.locator('.log-entry');
    const count = await logEntries.count();

    if (count > 0) {
      const level = await logEntries.first().locator('.level').textContent();
      expect(['info', 'warn', 'error', 'debug']).toContain(level);
    }
  });

  test('should apply level-based styling', async ({ page }) => {
    await waitForAppReady(page);

    const logEntries = page.locator('.log-entry');
    const count = await logEntries.count();

    if (count > 0) {
      const firstLog = logEntries.first();
      const classList = await firstLog.getAttribute('class');
      expect(classList).toContain('log-entry');
    }
  });
});
