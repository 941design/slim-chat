import { expect, Page } from '@playwright/test';
import { test } from './fixtures';
import { ensureIdentityExists, waitForAppReady } from './helpers';
import WebSocket from 'ws';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';

// Relay URL - uses NOSTLING_DEV_RELAY from docker-compose.e2e.yml
const RELAY_URL = process.env.NOSTLING_DEV_RELAY || 'ws://localhost:8080';

/**
 * Send a nostr event directly to the relay via WebSocket
 */
async function sendEventToRelay(event: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(RELAY_URL);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout sending event to relay'));
    }, 5000);

    ws.on('open', () => {
      ws.send(JSON.stringify(['EVENT', event]));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg[0] === 'OK' && msg[1] === event.id) {
        clearTimeout(timeout);
        ws.close();
        if (msg[2]) {
          resolve();
        } else {
          reject(new Error(`Relay rejected event: ${msg[3]}`));
        }
      } else if (msg[0] === 'OK' && !msg[2]) {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(`Relay rejected event: ${msg[3]}`));
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Create and sign a kind:0 profile event
 */
function createProfileEvent(
  secretKey: Uint8Array,
  profile: { name?: string; picture?: string; about?: string }
): any {
  const pubkey = getPublicKey(secretKey);
  const event = {
    kind: 0,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(profile),
  };
  return finalizeEvent(event, secretKey);
}

/**
 * Generate a test identity keypair
 */
function generateTestKeypair(): { secretKey: Uint8Array; pubkey: string; npub: string } {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const npub = nip19.npubEncode(pubkey);
  return { secretKey, pubkey, npub };
}

async function createContact(page: Page, npub: string, alias: string) {
  await page.locator('button[aria-label="Add contact"]').click();
  await page.locator('input[placeholder="npub..."]').fill(npub);
  await page.locator('input[placeholder="Friend"]').fill(alias);
  await page.locator('button:has-text("Save")').click();
  const contactItem = page.locator('[data-testid^="contact-item-"]', { hasText: alias });
  await expect(contactItem).toBeVisible();
  return contactItem;
}

async function openContactProfile(page: Page, contactItem: ReturnType<Page['locator']>) {
  // Click on the contact item to view profile
  await contactItem.locator('button[aria-label="View contact profile"]').click();
  const contactsPanel = page.locator('[data-testid="contacts-panel"]');
  await expect(contactsPanel).toBeVisible();
  return contactsPanel;
}

test.describe('Contact deletion', () => {
  test('shows confirmation modal and keeps contact when cancelled', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Delete Flow Identity');

    const contactItem = await createContact(page, 'npub-cancel-contact', 'Keep Contact');
    const contactsPanel = await openContactProfile(page, contactItem);

    // Click remove button in profile header
    await contactsPanel.locator('[data-testid="contacts-panel-remove"]').click();
    const dialog = page.locator('[data-testid="delete-contact-dialog"]');
    await expect(dialog).toBeVisible();

    await dialog.locator('button:has-text("Cancel")').click();
    await expect(dialog).toBeHidden();

    // Return to chat view
    await contactsPanel.locator('[data-testid="contacts-panel-close"]').click();
    await expect(contactItem).toBeVisible();
  });

  test('removes contact after confirming deletion', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Delete Flow Identity');

    const contactItem = await createContact(page, 'npub-delete-contact', 'Delete Me');
    const contactsPanel = await openContactProfile(page, contactItem);

    // Click remove button in profile header
    await contactsPanel.locator('[data-testid="contacts-panel-remove"]').click();
    const dialog = page.locator('[data-testid="delete-contact-dialog"]');
    await expect(dialog).toBeVisible();

    await dialog.locator('[data-testid="confirm-delete-contact-button"]').click();
    await expect(dialog).toBeHidden();
    await expect(contactItem).toHaveCount(0);
  });

  test('profile close button is labeled Return', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Delete Flow Identity');

    const contactItem = await createContact(page, 'npub-return-label', 'Label Test');
    const contactsPanel = await openContactProfile(page, contactItem);

    // Verify the close button says "Return"
    const returnButton = contactsPanel.locator('[data-testid="contacts-panel-close"]');
    await expect(returnButton).toHaveText('Return');
  });
});

test.describe('Contact alias editing', () => {
  test('displays contact alias in profile header', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Alias Edit Identity');

    const contactItem = await createContact(page, 'npub-alias-display', 'Alice Contact');
    const contactsPanel = await openContactProfile(page, contactItem);

    // Verify the display name shows the alias
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await expect(displayName).toHaveText('Alice Contact');
  });

  test('pencil icon appears on hover and opens edit mode', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Alias Edit Identity');

    const contactItem = await createContact(page, 'npub-edit-hover', 'Edit Hover Test');
    const contactsPanel = await openContactProfile(page, contactItem);

    // Hover over the display name area to reveal edit button
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await displayName.hover();

    // Click the edit button
    const editButton = contactsPanel.locator('[data-testid="contacts-panel-edit-alias"]');
    await expect(editButton).toBeVisible();
    await editButton.click();

    // Verify edit mode is active (input visible)
    const aliasInput = contactsPanel.locator('[data-testid="contacts-panel-alias-input"]');
    await expect(aliasInput).toBeVisible();
    await expect(aliasInput).toHaveValue('Edit Hover Test');
  });

  test('can edit alias and save with check button', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Alias Edit Identity');

    const contactItem = await createContact(page, 'npub-edit-save', 'Original Name');
    const contactsPanel = await openContactProfile(page, contactItem);

    // Open edit mode
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await displayName.hover();
    await contactsPanel.locator('[data-testid="contacts-panel-edit-alias"]').click();

    // Clear and type new alias
    const aliasInput = contactsPanel.locator('[data-testid="contacts-panel-alias-input"]');
    await aliasInput.clear();
    await aliasInput.fill('Updated Name');

    // Save with check button
    await contactsPanel.locator('[data-testid="contacts-panel-save-alias"]').click();

    // Verify display name updated
    await expect(displayName).toHaveText('Updated Name');
  });

  test('can edit alias and save with Enter key', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Alias Edit Identity');

    const contactItem = await createContact(page, 'npub-edit-enter', 'Before Enter');
    const contactsPanel = await openContactProfile(page, contactItem);

    // Open edit mode
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await displayName.hover();
    await contactsPanel.locator('[data-testid="contacts-panel-edit-alias"]').click();

    // Clear and type new alias, press Enter
    const aliasInput = contactsPanel.locator('[data-testid="contacts-panel-alias-input"]');
    await aliasInput.clear();
    await aliasInput.fill('After Enter');
    await aliasInput.press('Enter');

    // Verify display name updated
    await expect(displayName).toHaveText('After Enter');
  });

  test('can cancel editing with X button', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Alias Edit Identity');

    const contactItem = await createContact(page, 'npub-cancel-x', 'Keep Original');
    const contactsPanel = await openContactProfile(page, contactItem);

    // Open edit mode
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await displayName.hover();
    await contactsPanel.locator('[data-testid="contacts-panel-edit-alias"]').click();

    // Type new alias but cancel
    const aliasInput = contactsPanel.locator('[data-testid="contacts-panel-alias-input"]');
    await aliasInput.clear();
    await aliasInput.fill('Should Not Save');
    await contactsPanel.locator('[data-testid="contacts-panel-cancel-edit"]').click();

    // Verify display name unchanged
    await expect(displayName).toHaveText('Keep Original');
  });

  test('can cancel editing with Escape key', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Alias Edit Identity');

    const contactItem = await createContact(page, 'npub-cancel-esc', 'Escape Test');
    const contactsPanel = await openContactProfile(page, contactItem);

    // Open edit mode
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await displayName.hover();
    await contactsPanel.locator('[data-testid="contacts-panel-edit-alias"]').click();

    // Type new alias but press Escape
    const aliasInput = contactsPanel.locator('[data-testid="contacts-panel-alias-input"]');
    await aliasInput.clear();
    await aliasInput.fill('Escaped Value');

    // Use keyboard to press Escape within the input context
    await page.keyboard.press('Escape');

    // Verify edit mode is closed (input should be hidden)
    await expect(aliasInput).toBeHidden();

    // Verify display name unchanged
    await expect(displayName).toHaveText('Escape Test');
  });

  test('updating alias immediately updates both header and sidebar', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Alias Update Identity');

    // Create contact with initial alias
    const contactItem = await createContact(page, 'npub-update-both', 'Initial Alias');

    // Verify sidebar shows initial alias
    await expect(contactItem).toContainText('Initial Alias');

    const contactsPanel = await openContactProfile(page, contactItem);

    // Verify header shows initial alias
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await expect(displayName).toHaveText('Initial Alias');

    // Open edit mode and change alias
    await displayName.hover();
    await contactsPanel.locator('[data-testid="contacts-panel-edit-alias"]').click();

    const aliasInput = contactsPanel.locator('[data-testid="contacts-panel-alias-input"]');
    await aliasInput.clear();
    await aliasInput.fill('Updated Alias');
    await contactsPanel.locator('[data-testid="contacts-panel-save-alias"]').click();

    // Verify header updates immediately
    await expect(displayName).toHaveText('Updated Alias', { timeout: 5000 });

    // Verify sidebar updates immediately (without closing the panel)
    const updatedContactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'Updated Alias' });
    await expect(updatedContactItem).toBeVisible({ timeout: 5000 });

    // Also verify old alias no longer shows in sidebar
    const oldAliasItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'Initial Alias' });
    await expect(oldAliasItem).not.toBeVisible();
  });

  test('clear alias button removes alias and shows fallback (npub)', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Alias Edit Identity');

    const contactItem = await createContact(page, 'npub-clear-alias', 'Clear Me');
    const contactsPanel = await openContactProfile(page, contactItem);

    // Hover to reveal clear button
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await displayName.hover();

    // Click clear alias button
    const clearButton = contactsPanel.locator('[data-testid="contacts-panel-clear-alias"]');
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    // Verify display name falls back to npub (may be truncated in header)
    await expect(displayName).toContainText('npub-clear');
  });

  test('clear alias button is hidden when contact has no alias', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Alias Edit Identity');

    // First create a contact with an alias, then clear it
    const contactItem = await createContact(page, 'npub-no-alias-test', 'Temp Alias');
    const contactsPanel = await openContactProfile(page, contactItem);

    // Clear the alias using the clear button
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await displayName.hover();

    const clearButton = contactsPanel.locator('[data-testid="contacts-panel-clear-alias"]');
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    // Wait for alias to be cleared (display name should show npub - may be truncated in header)
    await expect(displayName).toContainText('npub-no-al');

    // Now hover again - clear button should NOT be visible since alias is cleared
    await displayName.hover();
    await expect(clearButton).toHaveCount(0);
  });
});

/**
 * Alias Clearing Fallback Path Tests
 *
 * Tests for display name precedence chain: alias > profile > npub
 * When alias is cleared, the display should fall back according to this precedence.
 *
 * NOTE: Profile discovery-dependent tests are in profile-avatars.spec.ts.
 * These tests focus on the clear-alias IPC handler functionality.
 */
test.describe('Alias clearing fallback paths', () => {
  test('clear alias falls back to npub when no profile exists', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Fallback Test Identity');

    // Generate a contact keypair (NO profile event sent)
    const contact = generateTestKeypair();

    // Add contact with an alias
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder="npub..."]').fill(contact.npub);
    await page.locator('input[placeholder="Friend"]').fill('TempAlias');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Open contact profile
    const contactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'TempAlias' });
    await expect(contactItem).toBeVisible({ timeout: 5000 });
    await contactItem.locator('button[aria-label="View contact profile"]').click();

    const contactsPanel = page.locator('[data-testid="contacts-panel"]');
    await expect(contactsPanel).toBeVisible();

    // Verify alias is showing
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await expect(displayName).toHaveText('TempAlias');

    // Hover and clear the alias
    await displayName.hover();
    const clearButton = contactsPanel.locator('[data-testid="contacts-panel-clear-alias"]');
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    // After clearing alias with no profile, should fall back to npub
    // npub starts with 'npub1' (bech32 encoded)
    await expect(displayName).toContainText('npub1', { timeout: 5000 });
  });

  test('alias takes precedence over profile name', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Precedence Test Identity');

    // Generate a contact keypair and send a public profile event
    const contact = generateTestKeypair();
    const profileEvent = createProfileEvent(contact.secretKey, {
      name: 'DiscoveredName',
    });
    await sendEventToRelay(profileEvent);

    // Add contact with an alias
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder="npub..."]').fill(contact.npub);
    await page.locator('input[placeholder="Friend"]').fill('MyCustomAlias');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Wait for profile discovery
    await page.waitForTimeout(3000);

    // Verify alias takes precedence (not the discovered profile name)
    const contactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'MyCustomAlias' });
    await expect(contactItem).toBeVisible({ timeout: 5000 });

    // Profile name should NOT be showing in sidebar
    const profileNameItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'DiscoveredName' });
    await expect(profileNameItem).not.toBeVisible();
  });

  test('cleared alias shows npub in sidebar', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Sidebar Npub Identity');

    // Generate a contact keypair (no profile)
    const contact = generateTestKeypair();

    // Add contact with an alias
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder="npub..."]').fill(contact.npub);
    await page.locator('input[placeholder="Friend"]').fill('SidebarClearAlias');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Verify alias is showing in sidebar
    const aliasItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'SidebarClearAlias' });
    await expect(aliasItem).toBeVisible({ timeout: 5000 });

    // Open contact profile and clear alias
    await aliasItem.locator('button[aria-label="View contact profile"]').click();
    const contactsPanel = page.locator('[data-testid="contacts-panel"]');
    await expect(contactsPanel).toBeVisible();

    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await displayName.hover();
    const clearButton = contactsPanel.locator('[data-testid="contacts-panel-clear-alias"]');
    await clearButton.click();

    // Verify display name in panel shows npub
    await expect(displayName).toContainText('npub1', { timeout: 5000 });

    // Close profile panel
    await contactsPanel.locator('[data-testid="contacts-panel-close"]').click();

    // Verify sidebar now shows npub (not alias)
    await expect(aliasItem).not.toBeVisible();
    const npubItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'npub1' });
    await expect(npubItem).toBeVisible({ timeout: 5000 });
  });

  test('clear alias falls back to profile name when profile exists', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Profile Fallback Identity');

    // Generate a contact keypair and send a public profile event FIRST
    const contact = generateTestKeypair();
    const profileEvent = createProfileEvent(contact.secretKey, {
      name: 'ProfileFallbackName',
    });
    await sendEventToRelay(profileEvent);

    // Add contact WITH an alias (alias takes precedence initially)
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder="npub..."]').fill(contact.npub);
    await page.locator('input[placeholder="Friend"]').fill('TemporaryAlias');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Wait for profile discovery to complete
    await page.waitForTimeout(3000);

    // Verify alias is showing (alias takes precedence over profile)
    const contactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'TemporaryAlias' });
    await expect(contactItem).toBeVisible({ timeout: 5000 });

    // Open contact profile
    await contactItem.locator('button[aria-label="View contact profile"]').click();
    const contactsPanel = page.locator('[data-testid="contacts-panel"]');
    await expect(contactsPanel).toBeVisible();

    // Verify display name shows alias
    const displayName = contactsPanel.locator('[data-testid="contacts-panel-display-name"]');
    await expect(displayName).toHaveText('TemporaryAlias');

    // Hover and clear the alias
    await displayName.hover();
    const clearButton = contactsPanel.locator('[data-testid="contacts-panel-clear-alias"]');
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    // BUG TEST: After clearing alias WITH a profile existing,
    // should fall back to profile name (not npub!)
    // Precedence chain: alias > profile > npub
    await expect(displayName).toHaveText('ProfileFallbackName', { timeout: 5000 });

    // Also verify sidebar shows profile name
    await contactsPanel.locator('[data-testid="contacts-panel-close"]').click();
    const profileNameItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'ProfileFallbackName' });
    await expect(profileNameItem).toBeVisible({ timeout: 5000 });
  });
});
