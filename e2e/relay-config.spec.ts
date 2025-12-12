/**
 * E2E tests for Relay Configuration view
 *
 * Tests the relay config UI flow:
 * - Navigation via menu
 * - View switching (chat <-> relay config)
 * - Adding, editing, removing relays
 * - Persisting changes
 */

import { test, expect } from './fixtures';
import { waitForAppReady, navigateToRelayConfig, returnToChat, clickButton, ensureIdentityExists } from './helpers';

test.describe('Relay Configuration View', () => {
  test('should navigate to relay config via menu', async ({ page }) => {
    await waitForAppReady(page);

    // Open hamburger menu
    await page.locator('button[aria-label="Open menu"]').click();

    // Click Relay Configuration menu item
    await page.locator('[data-value="relay-config"]').click();

    // Verify relay config heading is visible
    await expect(page.locator('h2:has-text("Relay Configuration"), h3:has-text("Relay Configuration")')).toBeVisible();

    // Verify Done button is visible
    await expect(page.locator('.relay-config-done-button')).toBeVisible();

    // Verify chat/conversation pane is hidden
    await expect(page.locator('.conversation-pane')).not.toBeVisible();
  });

  test('should return to chat view via Done button', async ({ page }) => {
    await waitForAppReady(page);

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Click Done button
    await page.locator('.relay-config-done-button').click();

    // Verify back to chat view - conversation pane should be visible
    await expect(page.locator('.conversation-pane')).toBeVisible();

    // Verify relay config Done button is no longer visible
    await expect(page.locator('.relay-config-done-button')).not.toBeVisible();
  });

  test('should add a new relay', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists (required for relay table to show)
    await ensureIdentityExists(page);

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Wait for relay table to load
    await expect(page.locator('table')).toBeVisible();

    // Count initial relay rows (excluding header and add-relay row)
    const initialCount = await page.locator('table tbody tr input[placeholder="wss://relay.example.com"]').count();

    // Find the add-relay input (last row in table has the "+" symbol and input)
    const addRelayInput = page.locator('table tbody tr').last().locator('input[placeholder="wss://relay.example.com"]');
    await expect(addRelayInput).toBeVisible();

    // Type a new relay URL and press Enter to add
    await addRelayInput.fill('wss://test-relay.example.com');
    await addRelayInput.press('Enter');

    // Verify new relay input appeared (count increased)
    // Wait for the change to be reflected - a new row should exist
    await expect(page.locator('table tbody tr input[placeholder="wss://relay.example.com"]')).toHaveCount(initialCount + 1, { timeout: 5000 });
  });

  test('should edit relay URL', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists (required for relay table to show)
    await ensureIdentityExists(page);

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Wait for relay table to load
    await expect(page.locator('table')).toBeVisible();

    // Get relay input fields (excluding the add-relay row which is the last row)
    // The existing relay inputs are in rows before the last one
    const relayRows = page.locator('table tbody tr');
    const rowCount = await relayRows.count();

    // If no relays exist (only the add row), add one first
    if (rowCount <= 1) {
      const addRelayInput = relayRows.last().locator('input[placeholder="wss://relay.example.com"]');
      await addRelayInput.fill('wss://initial-relay.example.com');
      await addRelayInput.press('Enter');
      // Wait for the new row to appear
      await expect(page.locator('table tbody tr')).toHaveCount(rowCount + 1, { timeout: 5000 });
    }

    // Edit first relay URL (first row should be a relay, not the add row)
    // Use specific selector for URL input to avoid matching hidden checkbox inputs
    const firstRelayInput = relayRows.first().locator('input[placeholder="wss://relay.example.com"]');
    await firstRelayInput.fill('wss://edited-test.relay.com');
    await firstRelayInput.blur();

    // Verify the value was updated (changes are auto-saved via onChange)
    await expect(firstRelayInput).toHaveValue('wss://edited-test.relay.com');
  });

  test('should remove a relay', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists (required for relay table to show)
    await ensureIdentityExists(page);

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Wait for relay table to load
    await expect(page.locator('table')).toBeVisible();

    // Get relay rows (the last row is always the "add relay" row)
    const relayRows = page.locator('table tbody tr');
    let rowCount = await relayRows.count();

    // Add a relay if only the add-row exists
    if (rowCount <= 1) {
      const addRelayInput = relayRows.last().locator('input[placeholder="wss://relay.example.com"]');
      await addRelayInput.fill('wss://test-to-remove.example.com');
      await addRelayInput.press('Enter');
      // Wait for the new row to appear
      await expect(page.locator('table tbody tr')).toHaveCount(rowCount + 1, { timeout: 5000 });
      rowCount = await relayRows.count();
    }

    // Click Remove button on first relay row
    const removeButton = relayRows.first().locator('button[aria-label="Remove relay"]');
    await expect(removeButton).toBeVisible();
    await removeButton.click();

    // Verify relay row count decreased
    await expect(page.locator('table tbody tr')).toHaveCount(rowCount - 1, { timeout: 5000 });
  });

  test('should persist relay changes after save', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists (required for relay table to show)
    await ensureIdentityExists(page);

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Wait for relay table to load
    await expect(page.locator('table')).toBeVisible();

    // Add a unique relay via the add-relay input row
    const uniqueUrl = `wss://test-${Date.now()}.relay.com`;
    const addRelayInput = page.locator('table tbody tr').last().locator('input[placeholder="wss://relay.example.com"]');
    await addRelayInput.fill(uniqueUrl);
    await addRelayInput.press('Enter');

    // Wait for the relay to be added to the table
    await expect(page.locator(`input[value="${uniqueUrl}"]`)).toBeVisible({ timeout: 5000 });

    // Return to chat and back - changes are auto-saved via onChange callback
    await page.locator('.relay-config-done-button').click();
    await waitForAppReady(page);
    await navigateToRelayConfig(page);

    // Wait for relay table to reload
    await expect(page.locator('table')).toBeVisible();

    // Verify relay persisted
    await expect(page.locator(`input[value="${uniqueUrl}"]`)).toBeVisible({ timeout: 5000 });
  });

  test('should have relay configuration UI elements', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists (required for relay table to show)
    await ensureIdentityExists(page);

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Verify UI elements are present
    // Heading "Relay Configuration" (using role selector to avoid matching menu item)
    await expect(page.getByRole('heading', { name: 'Relay Configuration' })).toBeVisible();
    // Done button to return to chat
    await expect(page.locator('.relay-config-done-button')).toBeVisible();
    // Relay table is visible
    await expect(page.locator('table')).toBeVisible();
    // Verify header text exists (using text selectors which are more robust)
    await expect(page.locator('text=Enabled')).toBeVisible();
    await expect(page.locator('text=Status')).toBeVisible();
    await expect(page.locator('text=URL')).toBeVisible();

    // Verify add-relay input row exists (has "+" symbol and input)
    const addRelayRow = page.locator('table tbody tr').last();
    await expect(addRelayRow.locator('input[placeholder="wss://relay.example.com"]')).toBeVisible();

    // Verify summary text exists at bottom (e.g., "0 relays · 0 connected · 0 failed")
    await expect(page.locator('text=/\\d+ relays/')).toBeVisible();
  });
});
