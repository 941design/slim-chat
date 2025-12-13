import { Page } from '@playwright/test';

export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('.app-shell', { timeout: 10000 });
  await page.waitForLoadState('domcontentloaded');
}

export async function getAppVersion(page: Page): Promise<string> {
  const versionText = await page.locator('.footer-version').textContent();
  return versionText?.replace('v', '') || '';
}

/**
 * Themed message alternatives from themed-messages.json
 */
const THEMED_MESSAGES = {
  idle: ['Standing tall', 'Preening idly', 'Ostrich lounging', 'Up to date'],
  checking: ['Scouting the savanna', 'Ostrich eyeing', 'Beak probing', 'Checking'],
  available: ['Hatching updates', 'Fresh eggs spotted', 'New feathers available', 'available'],
  downloading: ['Pecking up', 'Flocking in', 'Nestling down', 'Downloading'],
  downloaded: ['Pecked and cached', 'Nestled safely', 'Flock gathered', 'downloaded'],
  verifying: ['Inspecting eggs', 'Preening feathers', 'Checking the clutch', 'Verifying'],
  ready: ['Ready to strut', 'Hatched and ready', 'Feathers unfurled', 'ready'],
  failed: ['Head in sand', 'Fumbled feathers', 'Broken beak', 'failed'],
  offline: ['offline', 'savanna unreachable', 'flock distant', 'Network is offline'],
};

/**
 * Gets the current update phase from the footer status text.
 * Maps status text to phase name, supporting both standard and themed messages:
 * - "Up to date" or "Standing tall" -> "idle"
 * - "Checking for updates..." or "Scouting the savanna" -> "checking"
 * - "Update available" or "Hatching updates" -> "available"
 * - "Downloading update" or "Pecking up" -> "downloading"
 * - "Update downloaded" or "Pecked and cached" -> "downloaded"
 * - "Verifying update..." or "Inspecting eggs" -> "verifying"
 * - "Update ready" or "Ready to strut" -> "ready"
 * - "Update failed" or "Head in sand" -> "failed"
 */
export async function getUpdatePhase(page: Page): Promise<string> {
  const statusText = await page.locator('.footer-status').textContent();
  if (!statusText) return '';

  // Check each phase's themed alternatives
  for (const [phase, alternatives] of Object.entries(THEMED_MESSAGES)) {
    for (const alt of alternatives) {
      if (statusText.includes(alt)) {
        return phase;
      }
    }
  }

  return '';
}

/**
 * Checks if status text matches any themed alternative for a given phase.
 */
export function matchesThemedPhase(statusText: string, phase: string): boolean {
  const alternatives = THEMED_MESSAGES[phase as keyof typeof THEMED_MESSAGES];
  if (!alternatives) return false;

  return alternatives.some(alt => statusText.includes(alt));
}

/**
 * Gets the raw status text from the footer.
 */
export async function getStatusText(page: Page): Promise<string> {
  return await page.locator('.footer-status').textContent() || '';
}

export async function clickButton(page: Page, label: string): Promise<void> {
  await page.locator(`button:has-text("${label}")`).click();
}

/**
 * Waits for the footer status to show a specific phase.
 * Supports both standard and themed messages.
 * Polls until any themed alternative for the phase appears.
 */
export async function waitForUpdatePhase(page: Page, phase: string, timeout = 5000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const currentPhase = await getUpdatePhase(page);
    if (currentPhase === phase) {
      return;
    }
    await page.waitForTimeout(100);
  }

  throw new Error(`Timeout waiting for phase "${phase}" after ${timeout}ms`);
}

/**
 * Opens the hamburger menu and clicks Relay Configuration.
 * Waits for the relay config view to be visible.
 */
export async function navigateToRelayConfig(page: Page): Promise<void> {
  // Open hamburger menu
  await page.locator('button[aria-label="Open menu"]').click();
  // Click Relay Configuration menu item
  await page.locator('[data-value="relay-config"]').click();
  // Wait for relay config view to be visible
  await page.waitForSelector('.relay-config-done-button', { timeout: 5000 });
}

/**
 * Opens the hamburger menu and navigates to the About view.
 */
export async function navigateToAbout(page: Page): Promise<void> {
  await page.locator('button[aria-label="Open menu"]').click();
  await page.locator('[data-value="about"]').click();
  await page.waitForSelector('[data-testid="about-view"]', { timeout: 5000 });
}

/**
 * Clicks the Done button in relay config to return to chat view.
 */
export async function returnToChat(page: Page): Promise<void> {
  await page.locator('.relay-config-done-button').click();
  // Wait for conversation pane to be visible
  await page.waitForSelector('.conversation-pane', { timeout: 5000 });
}

/**
 * Returns from the About view using the Return button.
 */
export async function returnFromAbout(page: Page): Promise<void> {
  await page.locator('.about-return-button').click();
  await page.waitForSelector('[data-testid="conversation-pane"]', { timeout: 5000 });
}

/**
 * Ensures an identity exists by creating one if none exist.
 * This is required for relay config tests since the relay table only shows
 * when an identity is selected.
 */
export async function ensureIdentityExists(page: Page, label = 'Test Identity'): Promise<void> {
  // Check if any identity exists in the sidebar
  const identityItems = page.locator('.identity-item, [data-testid="identity-item"]');
  const count = await identityItems.count();

  if (count > 0) {
    // Identity already exists, click on it to select it
    await identityItems.first().click();
    return;
  }

  // No identity exists, create one
  // Click the + button to open identity modal
  await page.locator('button[aria-label="Create identity"]').click();

  // Wait for modal to appear
  await page.waitForSelector('text=Create or Import Identity', { timeout: 5000 });

  // Fill in the label
  await page.locator('input[placeholder="Personal account"]').fill(label);

  // Click Save button
  await page.locator('button:has-text("Save")').click();

  // Wait for modal to close and identity to be created
  await page.waitForSelector('text=Create or Import Identity', { state: 'hidden', timeout: 5000 });
}
