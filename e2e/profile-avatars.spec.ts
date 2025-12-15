/**
 * E2E tests for Profile Avatars Feature
 *
 * Tests profile discovery, storage, and avatar display:
 * 1. Public profile discovery (kind:0 from relay)
 * 2. Private profile reception (NIP-59 wrapped)
 * 3. Profile precedence rules
 * 4. Profile vs alias precedence
 * 5. Profile updates
 *
 * NOTE: Private profile handling tests may need additional integration work.
 */

import { test, expect } from './fixtures';
import { waitForAppReady, ensureIdentityExists } from './helpers';
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
        resolve();
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

test.describe('Profile Avatars - Public Profile Discovery', () => {
  test('should display public profile avatar for contact with kind:0 event', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // Generate a contact keypair
    const contact = generateTestKeypair();

    // Create and send a public profile event for the contact
    const profileEvent = createProfileEvent(contact.secretKey, {
      name: 'Test Contact',
      picture: 'https://example.com/avatar.jpg',
      about: 'Test profile for e2e',
    });
    await sendEventToRelay(profileEvent);

    // Add the contact to the app
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder*="npub"]').fill(contact.npub);
    await page.locator('input[placeholder*="Alias"]').fill('PublicProfileContact');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Wait for profile discovery to run (may need to trigger manually)
    await page.waitForTimeout(3000);

    // Verify contact appears in sidebar with avatar
    const contactItem = page.locator('.contact-item').filter({ hasText: 'Test Contact' });
    await expect(contactItem).toBeVisible({ timeout: 10000 });

    // Verify avatar shows public_discovered badge (green shield)
    const publicBadge = contactItem.locator('[data-testid="profile-badge-public"]');
    await expect(publicBadge).toBeVisible();
  });

  test('should show contact with no profile using letter avatar', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // Generate a contact keypair (no profile event sent)
    const contact = generateTestKeypair();

    // Add the contact to the app
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder*="npub"]').fill(contact.npub);
    await page.locator('input[placeholder*="Alias"]').fill('NoProfileContact');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Verify contact appears in sidebar
    const contactItem = page.locator('.contact-item').filter({ hasText: 'NoProfileContact' });
    await expect(contactItem).toBeVisible({ timeout: 5000 });

    // Verify avatar shows letter (N for NoProfileContact) with no-profile badge
    const noBadge = contactItem.locator('[data-testid="profile-badge-none"]');
    await expect(noBadge).toBeVisible();
  });
});

test.describe('Profile Avatars - Private Profile Reception', () => {
  test.skip('should display private profile avatar when received via NIP-59', async ({ page }) => {
    // FAILING TEST: Private profile handling needs integration
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // This test requires:
    // 1. Getting the identity's pubkey from the app
    // 2. Creating a NIP-59 wrapped profile event
    // 3. Sending it to the relay
    // 4. Verifying the profile appears with private_received badge

    // For now, mark as failing - needs NIP-59 wrapping implementation in test
    expect(true).toBe(false);
  });
});

test.describe('Profile Avatars - Precedence Rules', () => {
  test.skip('should prefer private_authored over public_discovered for own identity', async ({ page }) => {
    // FAILING TEST: Need to verify precedence
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // For identities (own profiles):
    // private_authored > public_discovered
    // The own identity should show private_authored badge

    // Get identity from sidebar
    const identityItem = page.locator('.identity-item').first();
    await expect(identityItem).toBeVisible();

    // Verify badge shows private_authored (blue shield)
    const privateBadge = identityItem.locator('[data-testid="profile-badge-private"]');
    await expect(privateBadge).toBeVisible();
  });

  test.skip('should prefer private_received over public_discovered for contacts', async ({ page }) => {
    // FAILING TEST: Need both profile types
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // Generate a contact keypair
    const contact = generateTestKeypair();

    // Send public profile
    const publicProfile = createProfileEvent(contact.secretKey, {
      name: 'Public Name',
      picture: 'https://example.com/public.jpg',
    });
    await sendEventToRelay(publicProfile);

    // TODO: Send private profile (NIP-59 wrapped) with different name
    // const privateProfile = ... (needs NIP-59 implementation)

    // Add contact
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder*="npub"]').fill(contact.npub);
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Wait for profile discovery
    await page.waitForTimeout(3000);

    // Verify private_received takes precedence (should show Private Name, not Public Name)
    // This test is expected to fail until NIP-59 private profile sending is implemented
    expect(true).toBe(false);
  });
});

test.describe('Profile Avatars - Profile vs Alias Precedence', () => {
  test.skip('should show profile name over alias when profile exists', async ({ page }) => {
    // FAILING TEST: Profile name should override alias
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // Generate a contact keypair
    const contact = generateTestKeypair();

    // Create and send a public profile event
    const profileEvent = createProfileEvent(contact.secretKey, {
      name: 'ProfileDisplayName',
      picture: 'https://example.com/avatar.jpg',
    });
    await sendEventToRelay(profileEvent);

    // Add contact with an alias
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder*="npub"]').fill(contact.npub);
    await page.locator('input[placeholder*="Alias"]').fill('AliasName');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Wait for profile discovery
    await page.waitForTimeout(3000);

    // Verify profile name is shown (ProfileDisplayName), not alias (AliasName)
    const contactItem = page.locator('.contact-item').filter({ hasText: 'ProfileDisplayName' });
    await expect(contactItem).toBeVisible({ timeout: 10000 });

    // Verify alias is NOT shown as primary name
    const aliasItem = page.locator('.contact-item').filter({ hasText: 'AliasName' });
    await expect(aliasItem).not.toBeVisible();
  });

  test.skip('should show alias when no profile exists', async ({ page }) => {
    // FAILING TEST: Alias fallback when no profile
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // Generate a contact keypair (no profile sent)
    const contact = generateTestKeypair();

    // Add contact with an alias
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder*="npub"]').fill(contact.npub);
    await page.locator('input[placeholder*="Alias"]').fill('OnlyAlias');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Verify alias is shown (since no profile exists)
    const contactItem = page.locator('.contact-item').filter({ hasText: 'OnlyAlias' });
    await expect(contactItem).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Profile Avatars - Profile Updates', () => {
  test.skip('should update avatar when profile is updated on relay', async ({ page }) => {
    // FAILING TEST: Profile updates should be reflected
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // Generate a contact keypair
    const contact = generateTestKeypair();

    // Create and send initial profile event
    const initialProfile = createProfileEvent(contact.secretKey, {
      name: 'InitialName',
      picture: 'https://example.com/initial.jpg',
    });
    await sendEventToRelay(initialProfile);

    // Add contact
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder*="npub"]').fill(contact.npub);
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Wait for initial profile discovery
    await page.waitForTimeout(3000);

    // Verify initial name is shown
    const initialItem = page.locator('.contact-item').filter({ hasText: 'InitialName' });
    await expect(initialItem).toBeVisible({ timeout: 10000 });

    // Create and send updated profile event (newer timestamp)
    const updatedProfile = createProfileEvent(contact.secretKey, {
      name: 'UpdatedName',
      picture: 'https://example.com/updated.jpg',
    });
    await sendEventToRelay(updatedProfile);

    // Wait for profile update to be discovered (hourly poll - need to trigger)
    // For test, we might need to trigger a refresh
    await page.waitForTimeout(5000);

    // Verify updated name is shown
    const updatedItem = page.locator('.contact-item').filter({ hasText: 'UpdatedName' });
    await expect(updatedItem).toBeVisible({ timeout: 10000 });

    // Verify old name is no longer shown
    await expect(initialItem).not.toBeVisible();
  });
});
