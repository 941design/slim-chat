import { test, expect } from './fixtures';
import { waitForAppReady, waitForUpdatePhase, getStatusText } from './helpers';

test.describe('Bug: Download Update Button Not Working', () => {
  test('should call downloadUpdate when clicking Download update button', async ({ page, electronApp }) => {
    /**
     * Regression test: Download update button calls downloadUpdate, not checkForUpdates
     *
     * Bug report: bug-reports/download-update-button-not-working-report.md
     * Fixed: 2025-12-07
     * Root cause: handlePrimary() in src/renderer/main.tsx was calling onCheck()
     *             for all non-ready phases, including 'available'
     *
     * Protection: Ensures that when phase is 'available' and user clicks "Download Update",
     *            the app calls downloadUpdate() (nested API), not checkForUpdates()
     *
     * Expected: Phase should NOT be 'checking' or 'available' after clicking
     *          (should transition to 'downloading' or 'failed' in test environment)
     */
    await waitForAppReady(page);

    // Set update state to 'available' (update detected, ready to download)
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows[0]) {
        windows[0].webContents.send('update-state', {
          phase: 'available',
          version: '1.0.0'
        });
      }
    });

    await waitForUpdatePhase(page, 'available');

    // Verify "Download Update" button is visible (new layout uses .footer-button)
    const button = page.locator('.footer-button:has-text("Download Update")');
    await expect(button).toBeVisible();

    // Click the "Download Update" button
    await button.click();

    // Wait a moment for the state change
    await page.waitForTimeout(200);

    // Get current status after button click
    const statusAfterClick = await getStatusText(page);
    console.log('Status after clicking Download Update:', statusAfterClick);

    // BUG: Currently the status will show 'Checking' or 'available'
    // (because it re-checks instead of downloading)
    // Expected: Should show 'Downloading'

    // This assertion will FAIL, demonstrating the bug
    // When fixed, clicking "Download Update" should NOT trigger a check
    expect(statusAfterClick).not.toContain('Checking');
    expect(statusAfterClick).not.toContain('available'); // Should have moved to downloading
  });
});
