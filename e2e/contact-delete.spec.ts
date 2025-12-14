import { expect, Page } from '@playwright/test';
import { test } from './fixtures';
import { ensureIdentityExists, waitForAppReady } from './helpers';

async function createContact(page: Page, npub: string, alias: string) {
  await page.locator('button[aria-label="Add contact"]').click();
  await page.locator('input[placeholder="npub..."]').fill(npub);
  await page.locator('input[placeholder="Friend"]').fill(alias);
  await page.locator('button:has-text("Save")').click();
  const contactItem = page.locator('[data-testid^="contact-item-"]', { hasText: alias });
  await expect(contactItem).toBeVisible();
  return contactItem;
}

test.describe('Contact deletion', () => {
  test('shows confirmation modal and keeps contact when cancelled', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Delete Flow Identity');

    const contactItem = await createContact(page, 'npub-cancel-contact', 'Keep Contact');

    await contactItem.locator('button[aria-label="Delete contact"]').click();
    const dialog = page.locator('[data-testid="delete-contact-dialog"]');
    await expect(dialog).toBeVisible();

    await dialog.locator('button:has-text("Cancel")').click();
    await expect(dialog).toBeHidden();
    await expect(contactItem).toBeVisible();
  });

  test('removes contact after confirming deletion', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Delete Flow Identity');

    const contactItem = await createContact(page, 'npub-delete-contact', 'Delete Me');

    await contactItem.locator('button[aria-label="Delete contact"]').click();
    const dialog = page.locator('[data-testid="delete-contact-dialog"]');
    await expect(dialog).toBeVisible();

    await dialog.locator('[data-testid="confirm-delete-contact-button"]').click();
    await expect(dialog).toBeHidden();
    await expect(contactItem).toHaveCount(0);
  });
});
