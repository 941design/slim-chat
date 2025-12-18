import { expect, Page } from '@playwright/test';
import { test } from './fixtures';
import { ensureIdentityExists, waitForAppReady } from './helpers';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';

/**
 * E2E tests for contact profile source indicator (lock icon)
 *
 * Tests three cases:
 * 1. No profile - no lock icon shown
 * 2. Private profile - closed lock icon shown (green)
 * 3. Public profile - open lock icon shown (muted color)
 */

/**
 * Generate a test keypair with valid npub and hex pubkey
 */
function generateTestKeypair(): { secretKey: Uint8Array; pubkey: string; npub: string } {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const npub = nip19.npubEncode(pubkey);
  return { secretKey, pubkey, npub };
}

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
function getHoverInfoText(page: Page) {
  return page.locator('.message-hover-info');
}

/**
 * Injects a mock profile into the database via test-only API
 */
async function injectMockProfile(
  page: Page,
  contactPubkeyHex: string,
  source: 'private_received' | 'public_discovered',
  content: Record<string, string>
) {
  await page.evaluate(
    async (args) => {
      // Access the test-only API exposed in test mode
      const api = (window as any).api;
      if (api?.test?.injectProfile) {
        return api.test.injectProfile(args);
      }
      throw new Error('Test API not available - ensure NODE_ENV=test');
    },
    { pubkey: contactPubkeyHex, source, content }
  );
}

test.describe('Contact profile source indicator', () => {
  test('shows no lock icon when contact has no profile', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Profile Source Test Identity');

    // Generate a valid keypair
    const contact = generateTestKeypair();

    // Create contact - by default it has no profile
    const contactsPanel = await createContactAndOpenProfile(page, contact.npub, 'No Profile Contact');

    // Wait for loading to complete
    await page.waitForTimeout(1000);

    // Verify no profile source indicator is shown
    const profileSourceIndicator = contactsPanel.locator('[data-testid="contacts-panel-profile-source"]');
    await expect(profileSourceIndicator).toHaveCount(0);
  });

  test('shows closed lock icon for private profile with hover info', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Profile Source Test Identity');

    // Generate a valid keypair
    const contact = generateTestKeypair();

    // Inject a private profile for this contact BEFORE creating
    await injectMockProfile(page, contact.pubkey, 'private_received', {
      name: 'Private User',
      about: 'This is a private profile',
    });

    // Create contact and open profile
    const contactsPanel = await createContactAndOpenProfile(page, contact.npub, 'Private Profile Contact');

    // Wait for loading to complete
    await page.waitForTimeout(1000);

    // Verify profile source indicator is shown
    const profileSourceIndicator = contactsPanel.locator('[data-testid="contacts-panel-profile-source"]');
    await expect(profileSourceIndicator).toBeVisible();

    // Verify it's the closed lock (check by hovering and verifying hover text)
    await profileSourceIndicator.hover();
    const hoverInfo = getHoverInfoText(page);
    await expect(hoverInfo).toBeVisible();
    await expect(hoverInfo).toContainText('Private profile shared directly with you');
  });

  test('shows open lock icon for public profile with hover info', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Profile Source Test Identity');

    // Generate a valid keypair
    const contact = generateTestKeypair();

    // Inject a public profile for this contact BEFORE creating
    await injectMockProfile(page, contact.pubkey, 'public_discovered', {
      name: 'Public User',
      about: 'This is a public profile from relays',
    });

    // Create contact and open profile
    const contactsPanel = await createContactAndOpenProfile(page, contact.npub, 'Public Profile Contact');

    // Wait for loading to complete
    await page.waitForTimeout(1000);

    // Verify profile source indicator is shown
    const profileSourceIndicator = contactsPanel.locator('[data-testid="contacts-panel-profile-source"]');
    await expect(profileSourceIndicator).toBeVisible();

    // Verify it's the open lock (check by hovering and verifying hover text)
    await profileSourceIndicator.hover();
    const hoverInfo = getHoverInfoText(page);
    await expect(hoverInfo).toBeVisible();
    await expect(hoverInfo).toContainText('Public profile from Nostr relays');
  });

  test('private profile takes precedence over public profile', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Profile Source Test Identity');

    // Generate a valid keypair
    const contact = generateTestKeypair();

    // Inject both private and public profiles BEFORE creating contact
    await injectMockProfile(page, contact.pubkey, 'public_discovered', {
      name: 'Public Name',
      about: 'Public profile',
    });
    await injectMockProfile(page, contact.pubkey, 'private_received', {
      name: 'Private Name',
      about: 'Private profile (should take precedence)',
    });

    // Create contact and open profile
    const contactsPanel = await createContactAndOpenProfile(page, contact.npub, 'Both Profiles Contact');

    // Wait for loading to complete
    await page.waitForTimeout(1000);

    // Verify profile source indicator shows private (closed lock)
    const profileSourceIndicator = contactsPanel.locator('[data-testid="contacts-panel-profile-source"]');
    await expect(profileSourceIndicator).toBeVisible();

    await profileSourceIndicator.hover();
    const hoverInfo = getHoverInfoText(page);
    await expect(hoverInfo).toContainText('Private profile shared directly with you');
  });
});
