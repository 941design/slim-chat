import { Page } from '@playwright/test';

export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('.app-shell', { timeout: 10000 });
  await page.waitForLoadState('domcontentloaded');
}

export async function getAppVersion(page: Page): Promise<string> {
  const versionText = await page.locator('.app-footer span').first().textContent();
  return versionText?.replace('v', '') || '';
}

export async function getUpdatePhase(page: Page): Promise<string> {
  const phaseText = await page.locator('.update-phase').textContent();
  return phaseText?.replace('Update: ', '') || '';
}

export async function clickButton(page: Page, label: string): Promise<void> {
  await page.locator(`button:has-text("${label}")`).click();
}

export async function waitForUpdatePhase(page: Page, phase: string, timeout = 5000): Promise<void> {
  await page.waitForSelector(`.update-phase:has-text("${phase}")`, { timeout });
}
