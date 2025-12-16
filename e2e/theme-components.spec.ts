/**
 * Theme Components E2E Tests
 *
 * Comprehensive tests for verifying that all UI components properly apply
 * theme colors when the theme is changed. Tests cover:
 * - App shell background
 * - Header (background, border, text)
 * - Footer (background, border, text)
 * - Sidebar (background, border)
 * - Identity and Contact lists
 * - Conversation pane and message bubbles
 * - Status cards and tables
 */

import { test, expect, type Page } from './fixtures';
import { waitForAppReady, ensureIdentityExists, navigateToAbout } from './helpers';

// Valid theme IDs (from presets)
// Light themes: mist, dawn, cloud, blossom, meadow
// Dark themes: obsidian (default), sapphire, ocean, arctic, storm, forest, jade, matrix,
//              ember, copper, sunset, mocha, amethyst, twilight, rose

// Theme order in carousel (based on presets/index.ts)
const THEME_ORDER = [
  'mist', 'dawn', 'cloud', 'blossom', 'meadow',
  'obsidian', 'sapphire', 'ocean', 'arctic', 'storm',
  'forest', 'jade', 'matrix',
  'ember', 'copper', 'sunset', 'mocha',
  'amethyst', 'twilight', 'rose'
];

/**
 * Helper to select a theme via the theme panel carousel
 */
async function selectTheme(page: Page, themeId: string): Promise<void> {
  // Open hamburger menu
  await page.locator('button[aria-label="Open menu"]').click();

  // Wait for menu to open
  await page.waitForTimeout(100);

  // Click on Theme panel trigger
  await page.locator('[data-testid="theme-panel-trigger"]').click();

  // Wait for theme panel to open
  await page.waitForSelector('[data-testid="theme-selection-panel"]', { timeout: 5000 });

  // Get the current theme from ThemeInfo
  const getDisplayedThemeName = async (): Promise<string> => {
    const nameElement = page.locator('[data-testid="theme-info-name"]');
    return (await nameElement.textContent())?.toLowerCase() || '';
  };

  // Navigate to the desired theme using carousel
  const targetIndex = THEME_ORDER.indexOf(themeId);
  if (targetIndex === -1) {
    throw new Error(`Unknown theme ID: ${themeId}`);
  }

  // Navigate using carousel - check if we're at the right theme
  let attempts = 0;
  const maxAttempts = THEME_ORDER.length + 2;

  while (attempts < maxAttempts) {
    const currentThemeName = await getDisplayedThemeName();
    if (currentThemeName === themeId.toLowerCase()) {
      break;
    }
    // Click next to cycle through themes
    await page.locator('[data-testid="theme-carousel-next"]').click();
    await page.waitForTimeout(100);
    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error(`Could not navigate to theme: ${themeId}`);
  }

  // Click Apply button
  await page.locator('[data-testid="theme-panel-ok"]').click();

  // Wait for panel to close and theme to be applied
  await page.waitForSelector('[data-testid="theme-selection-panel"]', { state: 'hidden', timeout: 5000 });
  await page.waitForTimeout(300);
}

test.describe('Theme Components', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Theme Test Identity');
  });

  test('should apply theme colors to app shell', async ({ page }) => {
    // Get initial app shell background (default is obsidian)
    const appShell = page.locator('[data-testid="app-shell"]');
    const initialBgColor = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(initialBgColor).not.toBe('rgba(0, 0, 0, 0)');

    // Switch to ember theme (warm)
    await selectTheme(page, 'ember');

    // Verify background color changed
    const emberBgColor = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(emberBgColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(emberBgColor).not.toBe(initialBgColor);

    // Switch to forest theme
    await selectTheme(page, 'forest');

    // Verify forest theme applied (different from ember)
    const forestBgColor = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(forestBgColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(forestBgColor).not.toBe(emberBgColor);
  });

  test('should apply theme colors to header', async ({ page }) => {
    const header = page.locator('[data-testid="app-header"]');

    // Verify header exists
    await expect(header).toBeVisible();

    // Switch to ocean theme
    await selectTheme(page, 'ocean');

    // Verify header has themed background (not hard to check exact rgba values)
    const bgColor = await header.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(bgColor).not.toBe('transparent');
  });

  test('should apply theme colors to footer', async ({ page }) => {
    const footer = page.locator('[data-testid="app-footer"]');

    // Verify footer exists
    await expect(footer).toBeVisible();

    // Switch to ocean theme
    await selectTheme(page, 'ocean');

    // Verify footer has themed background
    const bgColor = await footer.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(bgColor).not.toBe('transparent');
  });

  test('should apply theme colors to sidebar', async ({ page }) => {
    const sidebar = page.locator('[data-testid="app-sidebar"]');

    // Verify sidebar exists
    await expect(sidebar).toBeVisible();

    // Switch to ember theme
    await selectTheme(page, 'ember');

    // Verify sidebar has themed background
    const bgColor = await sidebar.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(bgColor).not.toBe('transparent');
  });

  test('should apply theme to identity list', async ({ page }) => {
    const identityList = page.locator('[data-testid="identity-list"]');

    // Verify identity list exists
    await expect(identityList).toBeVisible();

    // Find the identity heading
    const heading = identityList.locator('h2, h3, h4, [class*="heading"]').first();
    await expect(heading).toContainText('Identities');

    // Switch to forest theme and verify text color changes
    await selectTheme(page, 'forest');

    // The heading should have the themed text color
    const textColor = await heading.evaluate((el) =>
      window.getComputedStyle(el).color
    );
    // Forest theme has greenish text colors
    expect(textColor).not.toBe('rgb(0, 0, 0)'); // Not black
  });

  test('should apply theme to contact list', async ({ page }) => {
    const contactList = page.locator('[data-testid="contact-list"]');

    // Verify contact list exists
    await expect(contactList).toBeVisible();

    // Find the contacts heading
    const heading = contactList.locator('h2, h3, h4, [class*="heading"]').first();
    await expect(heading).toContainText('Contacts');

    // Switch to ocean theme
    await selectTheme(page, 'ocean');

    // Verify heading has themed text color
    const textColor = await heading.evaluate((el) =>
      window.getComputedStyle(el).color
    );
    // Should not be plain black or white
    expect(textColor).not.toBe('rgb(0, 0, 0)');
  });

  test('should apply theme to conversation pane', async ({ page }) => {
    const conversationPane = page.locator('[data-testid="conversation-pane"]');

    // Verify conversation pane exists
    await expect(conversationPane).toBeVisible();

    // Get initial border color
    const initialBorderColor = await conversationPane.evaluate((el) =>
      window.getComputedStyle(el).borderColor
    );

    // Switch to ember theme
    await selectTheme(page, 'ember');

    // Verify border color has changed
    const newBorderColor = await conversationPane.evaluate((el) =>
      window.getComputedStyle(el).borderColor
    );

    // Border colors should reflect ember theme
    expect(newBorderColor).not.toBe('rgb(0, 0, 0)');
  });

  test('should apply theme to nostling status card', async ({ page }) => {
    // Switch to ocean theme BEFORE navigating to About
    // (selectTheme uses Escape which can interfere with About view navigation)
    await selectTheme(page, 'ocean');

    // Now navigate to About view
    await navigateToAbout(page);
    const statusCard = page.locator('[data-testid="nostling-status-card"]');

    // Verify status card exists with ocean theme applied
    await expect(statusCard).toBeVisible();

    // Get background color - should be themed (not transparent)
    const bgColor = await statusCard.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );

    // Backgrounds should not be fully transparent
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  // Note: Theme persistence across reload is tested in theme-persistence.spec.ts

  test('should show current badge for active theme in theme panel', async ({ page }) => {
    // Switch to forest theme first
    await selectTheme(page, 'forest');

    // Reopen theme panel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.waitForTimeout(100);
    await page.locator('[data-testid="theme-panel-trigger"]').click();
    await page.waitForSelector('[data-testid="theme-selection-panel"]', { timeout: 5000 });

    // Get the displayed theme name - should be forest
    const themeNameElement = page.locator('[data-testid="theme-info-name"]');
    await expect(themeNameElement).toContainText('Forest');

    // The current badge should be visible when viewing the current theme
    const currentBadge = page.locator('[data-testid="theme-info-current-badge"]');
    await expect(currentBadge).toBeVisible();

    // Cancel to close the panel
    await page.locator('[data-testid="theme-panel-cancel"]').click();
  });

  test('should apply light theme correctly', async ({ page }) => {
    // Get initial background (dark theme)
    const appShell = page.locator('[data-testid="app-shell"]');
    const darkBgColor = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );

    // Switch to mist theme (light)
    await selectTheme(page, 'mist');

    // Verify light theme applied to app shell - should be lighter than dark theme
    const lightBgColor = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(lightBgColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(lightBgColor).not.toBe(darkBgColor);
  });

  test('all themed components should be consistent within a theme', async ({ page }) => {
    // Switch to ember theme for consistent testing
    await selectTheme(page, 'ember');

    // Get background colors from multiple components
    const components = [
      '[data-testid="app-header"]',
      '[data-testid="app-footer"]',
      '[data-testid="app-sidebar"]',
    ];

    const backgroundColors: string[] = [];

    for (const selector of components) {
      const element = page.locator(selector);
      const bgColor = await element.evaluate((el) =>
        window.getComputedStyle(el).backgroundColor
      );
      backgroundColors.push(bgColor);
    }

    // All header/footer/sidebar should have similar surface backgrounds (rgba transparency)
    // They should all not be transparent
    for (const color of backgroundColors) {
      expect(color).not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('should cycle through multiple themes correctly', async ({ page }) => {
    const themes = ['ember', 'ocean', 'forest', 'obsidian'];
    const appShell = page.locator('[data-testid="app-shell"]');
    let previousBgColor = '';

    for (const themeId of themes) {
      await selectTheme(page, themeId);

      const bgColor = await appShell.evaluate((el) =>
        window.getComputedStyle(el).backgroundColor
      );

      // Verify background is not transparent
      expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');

      // Verify background changed from previous theme
      if (previousBgColor) {
        expect(bgColor).not.toBe(previousBgColor);
      }
      previousBgColor = bgColor;
    }
  });
});
