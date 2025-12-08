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
 * Gets the current update phase from the footer status text.
 * Maps status text to phase name:
 * - "Up to date" -> "idle"
 * - "Checking for updates..." -> "checking"
 * - "Update available" -> "available"
 * - "Downloading update" -> "downloading"
 * - "Update downloaded" -> "downloaded"
 * - "Verifying update..." -> "verifying"
 * - "Update ready" -> "ready"
 * - "Update failed" -> "failed"
 */
export async function getUpdatePhase(page: Page): Promise<string> {
  const statusText = await page.locator('.footer-status').textContent();
  if (!statusText) return '';

  if (statusText === 'Up to date') return 'idle';
  if (statusText.startsWith('Checking')) return 'checking';
  if (statusText.startsWith('Update available')) return 'available';
  if (statusText.startsWith('Downloading')) return 'downloading';
  if (statusText === 'Update downloaded') return 'downloaded';
  if (statusText.startsWith('Verifying')) return 'verifying';
  if (statusText.startsWith('Update ready')) return 'ready';
  if (statusText.startsWith('Update failed')) return 'failed';

  return '';
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
 * Maps phase to status text patterns:
 * - "idle" -> "Up to date"
 * - "checking" -> "Checking"
 * - "available" -> "available"
 * - "downloading" -> "Downloading"
 * - "downloaded" -> "downloaded"
 * - "verifying" -> "Verifying"
 * - "ready" -> "ready"
 * - "failed" -> "failed"
 */
export async function waitForUpdatePhase(page: Page, phase: string, timeout = 5000): Promise<void> {
  const statusPatterns: Record<string, string> = {
    idle: 'Up to date',
    checking: 'Checking',
    available: 'available',
    downloading: 'Downloading',
    downloaded: 'downloaded',
    verifying: 'Verifying',
    ready: 'ready',
    failed: 'failed',
  };

  const pattern = statusPatterns[phase] || phase;
  await page.waitForSelector(`.footer-status:has-text("${pattern}")`, { timeout });
}
