import { expect, Page } from '@playwright/test';
import { test } from './fixtures';
import { ensureIdentityExists, waitForAppReady } from './helpers';

/**
 * Helper to create a contact and navigate to its profile
 */
async function createContactAndOpenProfile(page: Page, npub: string, alias: string) {
  await page.locator('button[aria-label="Add contact"]').click();
  await page.locator('input[placeholder="npub..."]').fill(npub);
  await page.locator('input[placeholder="Friend"]').fill(alias);
  await page.locator('button:has-text("Save")').click();

  const contactItem = page.locator('[data-testid^="contact-item-"]', { hasText: alias });
  await expect(contactItem).toBeVisible();

  // Click on the contact item to view profile
  await contactItem.locator('button[aria-label="View contact profile"]').click();
  const contactsPanel = page.locator('[data-testid="contacts-panel"]');
  await expect(contactsPanel).toBeVisible();
  return contactsPanel;
}

/**
 * Get the footer element that displays hover info
 */
function getFooter(page: Page) {
  return page.locator('[data-testid="app-footer"]');
}

/**
 * Get the hover info text element in the footer
 */
function getHoverInfoText(page: Page) {
  return page.locator('.hover-info');
}

test.describe('Contact panel hover info', () => {
  test('hovering over Remove button shows info text in footer', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Hover Info Identity');

    const contactsPanel = await createContactAndOpenProfile(page, 'npub-hover-remove', 'Remove Hover');

    // Get footer
    const footer = getFooter(page);
    await expect(footer).toBeVisible();

    // Initially no hover info
    const hoverInfo = getHoverInfoText(page);
    await expect(hoverInfo).toHaveCount(0);

    // Hover over Remove button
    const removeButton = contactsPanel.locator('[data-testid="contacts-panel-remove"]');
    await removeButton.hover();

    // Verify hover info appears in footer
    await expect(hoverInfo).toBeVisible();
    await expect(hoverInfo).toContainText('Remove this contact from your list');
  });

  test('hovering over Return button shows info text in footer', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Hover Info Identity');

    const contactsPanel = await createContactAndOpenProfile(page, 'npub-hover-return', 'Return Hover');

    // Hover over Return button
    const returnButton = contactsPanel.locator('[data-testid="contacts-panel-close"]');
    await returnButton.hover();

    // Verify hover info appears in footer
    const hoverInfo = getHoverInfoText(page);
    await expect(hoverInfo).toBeVisible();
    await expect(hoverInfo).toContainText('Return to conversation view');
  });

  test('hovering over edit alias button shows info text', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Hover Info Identity');

    const contactsPanel = await createContactAndOpenProfile(page, 'npub-hover-edit', 'Edit Hover');

    // Hover over display name to reveal edit button
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await displayName.hover();

    // Hover over edit button
    const editButton = contactsPanel.locator('[data-testid="contacts-panel-edit-alias"]');
    await expect(editButton).toBeVisible();
    await editButton.hover();

    // Verify hover info appears in footer
    const hoverInfo = getHoverInfoText(page);
    await expect(hoverInfo).toBeVisible();
    await expect(hoverInfo).toContainText('Edit contact alias');
  });

  test('hovering over clear alias button shows info text', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Hover Info Identity');

    const contactsPanel = await createContactAndOpenProfile(page, 'npub-hover-clear', 'Clear Hover');

    // Hover over display name to reveal clear button
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await displayName.hover();

    // Hover over clear button
    const clearButton = contactsPanel.locator('[data-testid="contacts-panel-clear-alias"]');
    await expect(clearButton).toBeVisible();
    await clearButton.hover();

    // Verify hover info appears in footer
    const hoverInfo = getHoverInfoText(page);
    await expect(hoverInfo).toBeVisible();
    await expect(hoverInfo).toContainText('Remove alias to show profile name');
  });

  test('hovering over copy npub button shows info text', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Hover Info Identity');

    const contactsPanel = await createContactAndOpenProfile(page, 'npub-hover-copy', 'Copy Hover');

    // Hover over the npub section to reveal copy button
    const npubSection = contactsPanel.locator('[data-testid="contacts-panel-npub"]');
    await npubSection.hover();

    // Hover over copy button
    const copyButton = contactsPanel.locator('[data-testid="contacts-panel-copy-npub"]');
    await expect(copyButton).toBeVisible();
    await copyButton.hover();

    // Verify hover info appears in footer
    const hoverInfo = getHoverInfoText(page);
    await expect(hoverInfo).toBeVisible();
    await expect(hoverInfo).toContainText('Copy public key to clipboard');
  });

  test('hovering over show QR button shows info text', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Hover Info Identity');

    const contactsPanel = await createContactAndOpenProfile(page, 'npub-hover-qr', 'QR Hover');

    // Hover over the npub section to reveal QR button
    const npubSection = contactsPanel.locator('[data-testid="contacts-panel-npub"]');
    await npubSection.hover();

    // Hover over QR button
    const qrButton = contactsPanel.locator('[data-testid="contacts-panel-show-qr"]');
    await expect(qrButton).toBeVisible();
    await qrButton.hover();

    // Verify hover info appears in footer
    const hoverInfo = getHoverInfoText(page);
    await expect(hoverInfo).toBeVisible();
    await expect(hoverInfo).toContainText('Display QR code for sharing');
  });

  test('hover info disappears with delay (hysteresis)', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Hover Info Identity');

    const contactsPanel = await createContactAndOpenProfile(page, 'npub-hover-hysteresis', 'Hysteresis Test');

    // Hover over Remove button
    const removeButton = contactsPanel.locator('[data-testid="contacts-panel-remove"]');
    await removeButton.hover();

    // Verify hover info appears
    const hoverInfo = getHoverInfoText(page);
    await expect(hoverInfo).toBeVisible();
    await expect(hoverInfo).toContainText('Remove this contact');

    // Move mouse away to content area
    await contactsPanel.locator('[data-testid="contacts-panel-npub"]').hover();

    // Text should still be visible briefly (hysteresis delay)
    // Note: This is a timing-sensitive test. If it fails intermittently,
    // the delay might need adjustment or the test approach reconsidered.
    await expect(hoverInfo).toBeVisible();

    // After the delay, it should disappear
    await expect(hoverInfo).toHaveCount(0, { timeout: 1000 });
  });

  test('moving between buttons updates hover info immediately', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Hover Info Identity');

    const contactsPanel = await createContactAndOpenProfile(page, 'npub-hover-switch', 'Switch Test');

    // Hover over Remove button
    const removeButton = contactsPanel.locator('[data-testid="contacts-panel-remove"]');
    await removeButton.hover();

    // Verify Remove hover info
    const hoverInfo = getHoverInfoText(page);
    await expect(hoverInfo).toContainText('Remove this contact');

    // Move to Return button
    const returnButton = contactsPanel.locator('[data-testid="contacts-panel-close"]');
    await returnButton.hover();

    // Verify Return hover info (immediate switch, no flicker)
    await expect(hoverInfo).toContainText('Return to conversation view');
  });

  test('editing mode buttons show hover info', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Hover Info Identity');

    const contactsPanel = await createContactAndOpenProfile(page, 'npub-hover-editing', 'Editing Hover');

    // Enter edit mode
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await displayName.hover();
    await contactsPanel.locator('[data-testid="contacts-panel-edit-alias"]').click();

    // Verify input is visible (edit mode active)
    const aliasInput = contactsPanel.locator('[data-testid="contacts-panel-alias-input"]');
    await expect(aliasInput).toBeVisible();

    // Hover over save button
    const saveButton = contactsPanel.locator('[data-testid="contacts-panel-save-alias"]');
    await saveButton.hover();

    const hoverInfo = getHoverInfoText(page);
    await expect(hoverInfo).toBeVisible();
    await expect(hoverInfo).toContainText('Save the edited alias');

    // Hover over cancel button
    const cancelButton = contactsPanel.locator('[data-testid="contacts-panel-cancel-edit"]');
    await cancelButton.hover();

    await expect(hoverInfo).toContainText('Cancel editing');
  });
});
