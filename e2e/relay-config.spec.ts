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
import { waitForAppReady, navigateToRelayConfig, returnToChat, clickButton } from './helpers';

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

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Count initial relay inputs
    const initialCount = await page.locator('input[placeholder*="wss://"]').count();

    // Click "Add relay" button (first one is for default relays)
    await page.locator('button:has-text("Add relay")').first().click();

    // Verify new relay input appeared
    const newCount = await page.locator('input[placeholder*="wss://"]').count();
    expect(newCount).toBe(initialCount + 1);

    // Verify Save Changes button is enabled (dirty state)
    await expect(page.locator('button:has-text("Save Changes")')).toBeEnabled();
  });

  test('should edit relay URL', async ({ page }) => {
    await waitForAppReady(page);

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Get relay input fields
    const inputs = page.locator('input[placeholder*="wss://"]');

    // If no relays exist, add one first
    if ((await inputs.count()) === 0) {
      await page.locator('button:has-text("Add relay")').first().click();
    }

    // Edit first relay URL
    const firstInput = inputs.first();
    await firstInput.fill('wss://edited-test.relay.com');

    // Verify Save Changes button is enabled (dirty state)
    await expect(page.locator('button:has-text("Save Changes")')).toBeEnabled();
  });

  test('should remove a relay', async ({ page }) => {
    await waitForAppReady(page);

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Add a relay if none exist
    const inputs = page.locator('input[placeholder*="wss://"]');
    let relayCount = await inputs.count();
    if (relayCount === 0) {
      await page.locator('button:has-text("Add relay")').first().click();
      relayCount = 1;
    }

    // Click Remove button (X button) on first relay
    await page.locator('button[aria-label="Remove relay"], button:has-text("Remove")').first().click();

    // Verify relay count decreased
    const newCount = await page.locator('input[placeholder*="wss://"]').count();
    expect(newCount).toBe(relayCount - 1);
  });

  test('should toggle read permission', async ({ page }) => {
    await waitForAppReady(page);

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Add relay if needed
    const inputs = page.locator('input[placeholder*="wss://"]');
    if ((await inputs.count()) === 0) {
      await page.locator('button:has-text("Add relay")').first().click();
    }

    // Find and click the Read checkbox
    const readCheckbox = page.locator('input[type="checkbox"]').first();
    const wasChecked = await readCheckbox.isChecked();
    await readCheckbox.click();

    // Verify state changed
    expect(await readCheckbox.isChecked()).toBe(!wasChecked);

    // Verify dirty state
    await expect(page.locator('button:has-text("Save Changes")')).toBeEnabled();
  });

  test('should persist relay changes after save', async ({ page }) => {
    await waitForAppReady(page);

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Add a unique relay
    await page.locator('button:has-text("Add relay")').first().click();
    const uniqueUrl = `wss://test-${Date.now()}.relay.com`;
    await page.locator('input[placeholder*="wss://"]').last().fill(uniqueUrl);

    // Save changes
    await page.locator('button:has-text("Save Changes")').click();

    // Wait for save to complete (button should become disabled)
    await expect(page.locator('button:has-text("Save Changes")')).toBeDisabled();

    // Return to chat and back
    await page.locator('.relay-config-done-button').click();
    await waitForAppReady(page);
    await navigateToRelayConfig(page);

    // Verify relay persisted
    await expect(page.locator(`input[value="${uniqueUrl}"]`)).toBeVisible();
  });

  test('should show default relays on first visit', async ({ page }) => {
    await waitForAppReady(page);

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Should have default relays pre-configured
    const inputs = page.locator('input[placeholder*="wss://"]');
    const count = await inputs.count();

    // We seeded 4 default relays in service.ts
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
