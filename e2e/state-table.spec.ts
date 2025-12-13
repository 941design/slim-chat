import { test, expect } from './fixtures';
import { waitForAppReady, navigateToAbout } from './helpers';

test.describe('State Table Display', () => {
  test('should display state table or empty message in main area', async ({ page }) => {
    await waitForAppReady(page);
    await navigateToAbout(page);

    // Either the table container or empty message should be visible
    const tableContainer = page.locator('.state-table-container');
    const emptyMessage = page.locator('.state-table-empty');

    // Wait for either state
    await expect(
      tableContainer.or(emptyMessage)
    ).toBeVisible({ timeout: 5000 });

    // If table exists, verify structure
    const hasTable = await tableContainer.isVisible();
    if (hasTable) {
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('.state-table-row').first()).toBeVisible();
    } else {
      await expect(emptyMessage).toHaveText('No state entries found');
    }
  });
});
