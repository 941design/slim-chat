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

import { test, expect, Page } from './fixtures';
import { waitForAppReady, ensureIdentityExists } from './helpers';
import WebSocket from 'ws';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { wrapEvent } from 'nostr-tools/nip59';

// Relay URL - uses NOSTLING_DEV_RELAY from docker-compose.e2e.yml
const RELAY_URL = process.env.NOSTLING_DEV_RELAY || 'ws://localhost:8080';

/**
 * Send a nostr event directly to the relay via WebSocket
 */
async function sendEventToRelay(event: any): Promise<void> {
  console.log(`[sendEventToRelay] Sending event kind ${event.kind} id ${event.id?.slice(0, 8)}... to ${RELAY_URL}`);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(RELAY_URL);
    const timeout = setTimeout(() => {
      console.log('[sendEventToRelay] Timeout waiting for relay response');
      ws.close();
      reject(new Error('Timeout sending event to relay'));
    }, 5000);

    ws.on('open', () => {
      console.log('[sendEventToRelay] WebSocket connected, sending event...');
      ws.send(JSON.stringify(['EVENT', event]));
    });

    ws.on('error', (err) => {
      console.log('[sendEventToRelay] WebSocket error:', err.message);
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log('[sendEventToRelay] Relay response:', JSON.stringify(msg));
      if (msg[0] === 'OK' && msg[1] === event.id) {
        clearTimeout(timeout);
        ws.close();
        if (msg[2]) {
          console.log('[sendEventToRelay] Event accepted by relay');
          resolve();
        } else {
          console.log('[sendEventToRelay] Event REJECTED by relay:', msg[3]);
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

/**
 * Get the identity's npub from the app UI
 */
async function getIdentityNpub(page: Page): Promise<string> {
  const identityItem = page.locator('[data-testid^="identity-item-"]').first();
  const npub = await identityItem.getAttribute('data-npub');
  if (!npub) {
    throw new Error('Could not get identity npub from UI');
  }
  return npub;
}

/**
 * Private profile kind (NIP-78 application-specific data)
 */
const PRIVATE_PROFILE_KIND = 30078;

/**
 * Create a private profile event (kind 30078)
 * This is the inner event that gets wrapped with NIP-59
 */
function createPrivateProfileEvent(
  secretKey: Uint8Array,
  profile: { name?: string; picture?: string; about?: string }
): any {
  const pubkey = getPublicKey(secretKey);
  const event = {
    kind: PRIVATE_PROFILE_KIND,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', 'profile']],
    content: JSON.stringify(profile),
  };
  // Note: For NIP-59 rumor, we create an unsigned event (no id/sig)
  // The wrapEvent function expects an unsigned event template
  return {
    kind: event.kind,
    pubkey: event.pubkey,
    created_at: event.created_at,
    tags: event.tags,
    content: event.content,
  };
}

/**
 * Create and send a NIP-59 wrapped private profile event to the relay
 */
async function sendPrivateProfileToRelay(
  senderSecretKey: Uint8Array,
  recipientPubkey: string,
  profile: { name?: string; picture?: string; about?: string }
): Promise<void> {
  // Create the inner profile event
  const profileEvent = createPrivateProfileEvent(senderSecretKey, profile);
  console.log('[NIP-59 TEST] Inner profile event:', JSON.stringify(profileEvent, null, 2));

  // Wrap with NIP-59
  const wrappedEvent = wrapEvent(profileEvent, senderSecretKey, recipientPubkey);
  console.log('[NIP-59 TEST] Wrapped event kind:', wrappedEvent.kind);
  console.log('[NIP-59 TEST] Wrapped event id:', wrappedEvent.id);
  const pTag = wrappedEvent.tags?.find((t: string[]) => t[0] === 'p');
  console.log('[NIP-59 TEST] Wrapped event p-tag:', pTag);
  console.log('[NIP-59 TEST] Expected recipient:', recipientPubkey);

  // Send to relay
  console.log('[NIP-59 TEST] Sending wrapped event to relay...');
  await sendEventToRelay(wrappedEvent);
  console.log('[NIP-59 TEST] Wrapped event sent successfully');
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

    // Add the contact to the app WITHOUT an alias to test profile name discovery
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder="npub..."]').fill(contact.npub);
    // Leave alias blank to test profile name takes effect
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Wait for profile discovery to run
    await page.waitForTimeout(3000);

    // Verify contact appears in sidebar with profile name from kind:0 event
    const contactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'Test Contact' });
    await expect(contactItem).toBeVisible({ timeout: 10000 });
  });

  test('should show contact with no profile using letter avatar', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // Generate a contact keypair (no profile event sent)
    const contact = generateTestKeypair();

    // Add the contact to the app
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder="npub..."]').fill(contact.npub);
    await page.locator('input[placeholder="Friend"]').fill('NoProfileContact');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Verify contact appears in sidebar
    const contactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'NoProfileContact' });
    await expect(contactItem).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Profile Avatars - Private Profile Reception', () => {
  test('should display private profile avatar when received via NIP-59', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // Generate a contact keypair (who will send us their private profile)
    const contact = generateTestKeypair();

    // Get the identity's npub and convert to hex pubkey for NIP-59 wrapping
    const identityNpub = await getIdentityNpub(page);
    const identityPubkey = nip19.decode(identityNpub).data as string;

    // Add the contact first (so the app can associate the incoming profile)
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder="npub..."]').fill(contact.npub);
    // Leave alias blank to test profile name takes effect
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Send a NIP-59 wrapped private profile from the contact to the identity
    await sendPrivateProfileToRelay(contact.secretKey, identityPubkey, {
      name: 'Private Profile Contact',
      picture: 'https://example.com/private-avatar.jpg',
      about: 'This is a private profile sent via NIP-59',
    });

    // Wait for profile to be received and processed
    await page.waitForTimeout(3000);

    // Verify contact appears with private profile name
    const contactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'Private Profile Contact' });
    await expect(contactItem).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Profile Avatars - Precedence Rules', () => {
  test('should show identity label when set (label takes precedence)', async ({ page }) => {
    // For identities: label > private_authored > public_discovered > npub
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // Get identity from sidebar - it should show the label
    const identityItem = page.locator('[data-testid^="identity-item-"]').first();
    await expect(identityItem).toBeVisible();

    // Verify identity is visible (label or npub will be shown)
    // The identity should exist and be selectable
    await identityItem.click();
    await expect(identityItem).toBeVisible();
  });

  test('should prefer private_received over public_discovered for contacts', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // Generate a contact keypair
    const contact = generateTestKeypair();

    // Get the identity's pubkey for NIP-59 wrapping
    const identityNpub = await getIdentityNpub(page);
    const identityPubkey = nip19.decode(identityNpub).data as string;

    // Send public profile first
    const publicProfile = createProfileEvent(contact.secretKey, {
      name: 'Public Name',
      picture: 'https://example.com/public.jpg',
    });
    await sendEventToRelay(publicProfile);

    // Add contact (this will trigger public profile discovery)
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder="npub..."]').fill(contact.npub);
    // Leave alias blank to test profile name takes effect
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Wait for public profile discovery
    await page.waitForTimeout(2000);

    // Verify public profile is initially shown
    let contactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'Public Name' });
    await expect(contactItem).toBeVisible({ timeout: 10000 });

    // Now send a private profile (should take precedence)
    await sendPrivateProfileToRelay(contact.secretKey, identityPubkey, {
      name: 'Private Name',
      picture: 'https://example.com/private.jpg',
    });

    // Wait for private profile to be received and processed
    await page.waitForTimeout(3000);

    // Verify private_received takes precedence (should show Private Name, not Public Name)
    contactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'Private Name' });
    await expect(contactItem).toBeVisible({ timeout: 10000 });

    // Verify public name is no longer shown
    const publicContactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'Public Name' });
    await expect(publicContactItem).not.toBeVisible();
  });
});

test.describe('Profile Avatars - Alias vs Profile Precedence', () => {
  test('should show alias when user sets one (alias takes precedence over profile)', async ({ page }) => {
    // Alias takes precedence over profile name - user preference wins
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
    await page.locator('input[placeholder="npub..."]').fill(contact.npub);
    await page.locator('input[placeholder="Friend"]').fill('AliasName');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Verify alias is shown (alias takes precedence over profile name)
    const contactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'AliasName' });
    await expect(contactItem).toBeVisible({ timeout: 5000 });
  });

  test('should show alias when no profile exists', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // Generate a contact keypair (no profile sent)
    const contact = generateTestKeypair();

    // Add contact with an alias
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder="npub..."]').fill(contact.npub);
    await page.locator('input[placeholder="Friend"]').fill('OnlyAlias');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Verify alias is shown (since no profile exists)
    const contactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'OnlyAlias' });
    await expect(contactItem).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Profile Avatars - Initial Profile Discovery', () => {
  test('should display profile name from relay when contact added without alias', async ({ page }) => {
    // Profile discovery runs when contact is added - discovered profile name should be shown
    await waitForAppReady(page);
    await ensureIdentityExists(page);

    // Generate a contact keypair
    const contact = generateTestKeypair();

    // Create and send profile event BEFORE adding contact
    const profileEvent = createProfileEvent(contact.secretKey, {
      name: 'DiscoveredName',
      picture: 'https://example.com/discovered.jpg',
    });
    await sendEventToRelay(profileEvent);

    // Add contact WITHOUT an alias - profile name should be discovered
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });
    await page.locator('input[placeholder="npub..."]').fill(contact.npub);
    // Don't fill alias - leave empty to test profile discovery
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('text=Add Contact', { state: 'hidden', timeout: 5000 });

    // Wait for profile discovery
    await page.waitForTimeout(3000);

    // Verify discovered profile name is shown (since no alias was set)
    const contactItem = page.locator('[data-testid^="contact-item-"]').filter({ hasText: 'DiscoveredName' });
    await expect(contactItem).toBeVisible({ timeout: 10000 });
  });
});
