import { expect, Page } from '@playwright/test';
import { test } from './fixtures';
import { ensureIdentityExists, waitForAppReady } from './helpers';

/**
 * Helper to create a contact for messaging
 */
async function createContact(page: Page, npub: string, alias: string) {
  await page.locator('button[aria-label="Add contact"]').click();
  await page.locator('input[placeholder="npub..."]').fill(npub);
  await page.locator('input[placeholder="Friend"]').fill(alias);
  await page.locator('button:has-text("Save")').click();

  const contactItem = page.locator('[data-testid^="contact-item-"]', { hasText: alias });
  await expect(contactItem).toBeVisible();
  await contactItem.click();
}

/**
 * Helper to send a test message
 * Note: This creates a local message for UI testing. The message will be in 'queued' status.
 * Returns a locator using the unique message ID to avoid strict mode violations.
 */
async function sendTestMessage(page: Page, content: string) {
  const textarea = page.locator('textarea[placeholder*="Type a message"]');
  await textarea.fill(content);
  await page.keyboard.press('Enter');

  // Wait for a message bubble containing this exact content to be visible
  // Use a filter to find bubbles that contain our message text
  const messageBubbles = page.locator('[data-testid="message-bubble"]');

  // Wait until at least one bubble with our content exists
  await expect(messageBubbles.filter({ hasText: content }).first()).toBeVisible({ timeout: 5000 });

  // Get all matching bubbles and use the first visible one
  const matchingBubble = messageBubbles.filter({ hasText: content }).first();

  // Get the unique message ID from the data attribute for precise selection
  const messageId = await matchingBubble.getAttribute('data-message-id');

  // Return a locator using the unique message ID
  return page.locator(`[data-testid="message-bubble"][data-message-id="${messageId}"]`);
}

test.describe('Message info modal', () => {
  test('info icon appears on message hover', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Message Info Test Identity');

    await createContact(page, 'npub1testinfoicon', 'Info Icon Test');

    // Send a test message
    const messageBubble = await sendTestMessage(page, 'Test message for info icon');

    // Initially, info button should not be visible (not hovered)
    const infoButton = messageBubble.locator('[data-testid="message-info-button"]');
    await expect(infoButton).toHaveCount(0);

    // Hover over the message bubble
    await messageBubble.hover();

    // Info button should now be visible
    await expect(infoButton).toBeVisible();
  });

  test('clicking info icon opens modal with JSON', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Message Info Modal Identity');

    await createContact(page, 'npub1testinfomodal', 'Info Modal Test');

    // Send a test message
    const messageBubble = await sendTestMessage(page, 'Test message for modal');

    // Hover and click info button
    await messageBubble.hover();
    const infoButton = messageBubble.locator('[data-testid="message-info-button"]');
    await infoButton.click();

    // Modal should open
    const modal = page.locator('[data-testid="message-info-modal"]');
    await expect(modal).toBeVisible();

    // Modal should have title
    await expect(modal.locator('text=Message Details')).toBeVisible();

    // Modal should contain JSON with message content
    const jsonContent = page.locator('[data-testid="message-info-json"]');
    await expect(jsonContent).toBeVisible();
    await expect(jsonContent).toContainText('"content"');
    await expect(jsonContent).toContainText('Test message for modal');
  });

  test('modal displays message fields correctly', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Message Fields Identity');

    await createContact(page, 'npub1testfields', 'Fields Test');

    // Send a test message
    const messageBubble = await sendTestMessage(page, 'Check all fields');

    // Open info modal
    await messageBubble.hover();
    await messageBubble.locator('[data-testid="message-info-button"]').click();

    // Verify JSON contains expected fields
    const jsonContent = page.locator('[data-testid="message-info-json"]');
    await expect(jsonContent).toContainText('"id"');
    await expect(jsonContent).toContainText('"content"');
    await expect(jsonContent).toContainText('"timestamp"');
    await expect(jsonContent).toContainText('"status"');
    await expect(jsonContent).toContainText('"direction"');
  });

  test('modal closes when pressing Escape key', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Modal Close Identity');

    await createContact(page, 'npub1testclose', 'Close Test');

    // Send a test message and open modal
    const messageBubble = await sendTestMessage(page, 'Close button test');
    await messageBubble.hover();
    await messageBubble.locator('[data-testid="message-info-button"]').click();

    // Modal should be open
    const modal = page.locator('[data-testid="message-info-modal"]');
    await expect(modal).toBeVisible();

    // Press Escape to close the modal
    await page.keyboard.press('Escape');

    // Modal should be closed
    await expect(modal).toHaveCount(0);
  });

  test('info icon has proper accessibility label', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'A11y Identity');

    await createContact(page, 'npub1testa11y', 'A11y Test');

    // Send a test message
    const messageBubble = await sendTestMessage(page, 'Accessibility test');

    // Hover to reveal info button
    await messageBubble.hover();

    // Check aria-label
    const infoButton = messageBubble.locator('[data-testid="message-info-button"]');
    await expect(infoButton).toHaveAttribute('aria-label', 'View message details');
  });

  test('JSON content is displayed in a pre element for code formatting', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Monospace Identity');

    await createContact(page, 'npub1testmono', 'Monospace Test');

    // Send and open info modal
    const messageBubble = await sendTestMessage(page, 'Monospace font test');
    await messageBubble.hover();
    await messageBubble.locator('[data-testid="message-info-button"]').click();

    // Check that JSON container is a pre element (semantic HTML for code)
    const jsonContainer = page.locator('[data-testid="message-info-json"]');
    await expect(jsonContainer).toBeVisible();

    // Verify the container is rendered as a <pre> element for proper code formatting
    const tagName = await jsonContainer.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('pre');

    // Verify it contains the JSON content formatted with proper whitespace
    const textContent = await jsonContainer.textContent();
    expect(textContent).toContain('"content"');
    expect(textContent).toContain('Monospace font test');
  });
});
