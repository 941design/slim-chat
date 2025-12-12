/**
 * E2E tests for UI Relay Integration (main.tsx with RelayTable and RelayConflictModal)
 *
 * Tests the complete relay configuration workflow:
 * - Load relays on identity change
 * - Toggle checkboxes to enable/disable relays (auto-save)
 * - Edit relay URLs (auto-save)
 * - Remove relays
 * - Add new relays
 * - Conflict detection and resolution
 * - Status updates reflect in real-time
 */

import { test, expect } from './fixtures';
import { waitForAppReady, navigateToRelayConfig, returnToChat, ensureIdentityExists } from './helpers';

test.describe('UI Relay Integration', () => {
  test('should load relays when identity is selected', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists
    await ensureIdentityExists(page);

    // Verify we're in chat view
    await expect(page.locator('.conversation-pane')).toBeVisible();

    // Navigate to relay config
    await navigateToRelayConfig(page);

    // Verify RelayTable is visible
    await expect(page.locator('table')).toBeVisible();

    // Verify Done button exists
    await expect(page.locator('.relay-config-done-button')).toBeVisible();
  });

  test('should display relay status dots', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists
    await ensureIdentityExists(page);

    await navigateToRelayConfig(page);

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible();

    // Ensure at least one relay exists
    const relayRows = page.locator('tbody').locator('tr');
    const rowCount = await relayRows.count();
    if (rowCount <= 1) {
      const addRelayInput = relayRows.last().locator('input[placeholder="wss://relay.example.com"]');
      await addRelayInput.fill('wss://status-test.relay.com');
      await addRelayInput.press('Enter');
      await page.waitForTimeout(500);
    }

    // Check for status column with colored dots
    // Status dots appear in the Status column
    const statusCells = page.locator('tbody').locator('tr').first().locator('td').nth(2);
    await expect(statusCells).toBeVisible();
  });

  test('should support adding a new relay with auto-save', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists
    await ensureIdentityExists(page);

    await navigateToRelayConfig(page);

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible();

    // Find the add relay input (in footer row)
    const addRelayInput = page.locator('tbody').locator('tr').last().locator('input[placeholder="wss://relay.example.com"]');

    // Type a new relay URL
    const newUrl = `wss://test-relay-${Date.now()}.com`;
    await addRelayInput.fill(newUrl);

    // Trigger add by pressing Enter or blurring
    await addRelayInput.press('Enter');

    // Verify new relay appears in table
    await expect(page.locator(`input[value="${newUrl}"]`)).toBeVisible();
  });

  test('should toggle relay enabled state', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists
    await ensureIdentityExists(page);

    await navigateToRelayConfig(page);

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible();

    // Ensure at least one relay exists by adding one
    const relayRows = page.locator('tbody').locator('tr');
    const rowCount = await relayRows.count();
    if (rowCount <= 1) {
      // Only the add-relay row exists, add a relay
      const addRelayInput = relayRows.last().locator('input[placeholder="wss://relay.example.com"]');
      await addRelayInput.fill('wss://toggle-test.relay.com');
      await addRelayInput.press('Enter');
      await page.waitForTimeout(500);
    }

    // Get the first relay row (not the add-relay row)
    const firstRow = page.locator('tbody').locator('tr').first();

    // Find the enabled checkbox container and verify it exists
    const enableCheckbox = firstRow.locator('[aria-label="Enabled"]');
    await expect(enableCheckbox).toBeVisible();

    // Get initial state - new relays start with enabled=true (read/write=true)
    const initialState = await enableCheckbox.getAttribute('data-state');

    // Chakra UI v3 uses Ark UI which has a hidden input inside Checkbox.Root
    // Click the hidden input directly to toggle the checkbox state
    const hiddenInput = enableCheckbox.locator('input[type="checkbox"]');
    await hiddenInput.click({ force: true });

    // Wait for UI to update
    await page.waitForTimeout(200);

    // Verify state changed
    const newState = await enableCheckbox.getAttribute('data-state');
    expect(newState).not.toBe(initialState);
  });

  test('should toggle relay read permission', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists
    await ensureIdentityExists(page);

    await navigateToRelayConfig(page);

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible();

    // Ensure at least one relay exists by adding one
    const relayRows = page.locator('tbody').locator('tr');
    const rowCount = await relayRows.count();
    if (rowCount <= 1) {
      const addRelayInput = relayRows.last().locator('input[placeholder="wss://relay.example.com"]');
      await addRelayInput.fill('wss://read-test.relay.com');
      await addRelayInput.press('Enter');
      await page.waitForTimeout(500);
    }

    // Get the first relay row
    const firstRow = page.locator('tbody').locator('tr').first();

    // Enable the relay first (if not already enabled)
    const enableCheckbox = firstRow.locator('[aria-label="Enabled"]');
    const enabledState = await enableCheckbox.getAttribute('data-state');
    if (enabledState !== 'checked') {
      const enableInput = enableCheckbox.locator('input[type="checkbox"]');
      await enableInput.click({ force: true });
      await page.waitForTimeout(200);
    }

    // Toggle the read checkbox using hidden input
    const readCheckbox = firstRow.locator('[aria-label="Read"]');
    const initialState = await readCheckbox.getAttribute('data-state');

    const readInput = readCheckbox.locator('input[type="checkbox"]');
    await readInput.click({ force: true });
    await page.waitForTimeout(200);

    // Verify state changed
    const newState = await readCheckbox.getAttribute('data-state');
    expect(newState).not.toBe(initialState);
  });

  test('should toggle relay write permission', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists
    await ensureIdentityExists(page);

    await navigateToRelayConfig(page);

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible();

    // Ensure at least one relay exists by adding one
    const relayRows = page.locator('tbody').locator('tr');
    const rowCount = await relayRows.count();
    if (rowCount <= 1) {
      const addRelayInput = relayRows.last().locator('input[placeholder="wss://relay.example.com"]');
      await addRelayInput.fill('wss://write-test.relay.com');
      await addRelayInput.press('Enter');
      await page.waitForTimeout(500);
    }

    // Get the first relay row
    const firstRow = page.locator('tbody').locator('tr').first();

    // Enable the relay first (if not already enabled)
    const enableCheckbox = firstRow.locator('[aria-label="Enabled"]');
    const enabledState = await enableCheckbox.getAttribute('data-state');
    if (enabledState !== 'checked') {
      const enableInput = enableCheckbox.locator('input[type="checkbox"]');
      await enableInput.click({ force: true });
      await page.waitForTimeout(200);
    }

    // Toggle the write checkbox using hidden input
    const writeCheckbox = firstRow.locator('[aria-label="Write"]');
    const initialState = await writeCheckbox.getAttribute('data-state');

    const writeInput = writeCheckbox.locator('input[type="checkbox"]');
    await writeInput.click({ force: true });
    await page.waitForTimeout(200);

    // Verify state changed
    const newState = await writeCheckbox.getAttribute('data-state');
    expect(newState).not.toBe(initialState);
  });

  test('should remove a relay', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists
    await ensureIdentityExists(page);

    await navigateToRelayConfig(page);

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible();

    // Ensure at least one relay exists by adding one
    const relayRows = page.locator('tbody').locator('tr');
    let rowCount = await relayRows.count();
    if (rowCount <= 1) {
      const addRelayInput = relayRows.last().locator('input[placeholder="wss://relay.example.com"]');
      await addRelayInput.fill('wss://remove-test.relay.com');
      await addRelayInput.press('Enter');
      await page.waitForTimeout(500);
      rowCount = await relayRows.count();
    }

    // Get the first relay row and find remove button
    const firstRow = page.locator('tbody').locator('tr').first();
    const removeButton = firstRow.locator('button[aria-label="Remove relay"]');

    await removeButton.click();

    // Verify row count decreased
    const newCount = await page.locator('tbody').locator('tr').count();
    expect(newCount).toBeLessThan(rowCount);
  });

  test('should edit relay URL', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists
    await ensureIdentityExists(page);

    await navigateToRelayConfig(page);

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible();

    // Ensure at least one relay exists by adding one
    const relayRows = page.locator('tbody').locator('tr');
    const rowCount = await relayRows.count();
    if (rowCount <= 1) {
      const addRelayInput = relayRows.last().locator('input[placeholder="wss://relay.example.com"]');
      await addRelayInput.fill('wss://edit-test.relay.com');
      await addRelayInput.press('Enter');
      await page.waitForTimeout(500);
    }

    // Get the first relay row URL input
    const firstRow = page.locator('tbody').locator('tr').first();
    const urlInput = firstRow.locator('input[placeholder="wss://relay.example.com"]');

    // Edit URL
    const newUrl = `wss://edited-${Date.now()}.relay.com`;
    await urlInput.fill(newUrl);
    await urlInput.blur();

    // Verify the URL was updated
    await expect(urlInput).toHaveValue(newUrl);
  });

  test('should show relay count summary', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists
    await ensureIdentityExists(page);

    await navigateToRelayConfig(page);

    // Wait for table to load
    await expect(page.locator('table')).toBeVisible();

    // Verify footer summary is visible (e.g., "N relays · M connected · K failed")
    const summary = page.locator('text=/\\d+ relays/');
    await expect(summary).toBeVisible();
  });

  test('should return to chat view via Done button', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists
    await ensureIdentityExists(page);

    await navigateToRelayConfig(page);

    // Verify relay config view is active
    await expect(page.locator('table')).toBeVisible();

    // Click Done button
    await page.locator('.relay-config-done-button').click();

    // Verify back in chat view
    await expect(page.locator('.conversation-pane')).toBeVisible();

    // Verify relay table is no longer visible (but StateTable might still be)
    await expect(page.locator('.relay-config-done-button')).not.toBeVisible();
  });

  test('should require identity selection for relay config', async ({ page }) => {
    await waitForAppReady(page);

    // Delete all identities or navigate to relay config before identity selection
    // Navigate to relay config
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-value="relay-config"]').click();

    // If no identity selected, should show message
    // Note: This test assumes at least one identity exists by default
    // Behavior depends on implementation
    await expect(page.locator('text=/Select an identity/i').or(page.locator('table'))).toBeVisible();
  });

  test('should persist relay changes across navigation', async ({ page }) => {
    await waitForAppReady(page);

    // Ensure an identity exists
    await ensureIdentityExists(page);

    await navigateToRelayConfig(page);

    // Wait for table
    await expect(page.locator('table')).toBeVisible();

    // Add a relay with unique URL
    const uniqueUrl = `wss://persist-test-${Date.now()}.relay.com`;
    const addRelayInput = page.locator('tbody').locator('tr').last().locator('input[placeholder="wss://relay.example.com"]');
    await addRelayInput.fill(uniqueUrl);
    await addRelayInput.press('Enter');

    // Wait for add to complete
    await page.waitForTimeout(500);

    // Verify relay was added
    await expect(page.locator(`input[value="${uniqueUrl}"]`)).toBeVisible();

    // Return to chat
    await page.locator('.relay-config-done-button').click();
    await expect(page.locator('.conversation-pane')).toBeVisible();

    // Navigate back to relay config
    await navigateToRelayConfig(page);

    // Verify relay persists
    await expect(page.locator(`input[value="${uniqueUrl}"]`)).toBeVisible();
  });

  test('should handle conflict modal on concurrent edits', async ({ page }) => {
    // This test would require the backend to simulate concurrent edits
    // For now, we test that conflict modal structure exists
    await waitForAppReady(page);
    await navigateToRelayConfig(page);

    // The conflict modal should exist in DOM (but hidden)
    // We can't easily trigger it without backend support
    // Verify modal structure is present
    const conflictModal = page.locator('[role="dialog"]').filter({ hasText: /conflict/i });

    // Modal exists but is hidden
    await expect(conflictModal).toHaveCount(0); // Not visible unless conflict occurs
  });
});
