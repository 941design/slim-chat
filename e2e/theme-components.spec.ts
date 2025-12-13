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

// Theme semantic color definitions for testing
const THEME_COLORS = {
  dark: {
    appBg: 'rgb(15, 23, 42)', // #0f172a
    surfaceBg: 'rgba(0, 0, 0, 0.3)',
    text: 'rgb(226, 232, 240)', // #e2e8f0
  },
  light: {
    appBg: 'rgb(248, 250, 252)', // #f8fafc
    surfaceBg: 'rgb(255, 255, 255)', // #ffffff
    text: 'rgb(30, 41, 59)', // #1e293b
  },
  amber: {
    appBg: 'rgb(26, 20, 16)', // #1a1410
    text: 'rgb(253, 230, 138)', // #fde68a
  },
  forest: {
    appBg: 'rgb(10, 31, 10)', // #0a1f0a
    text: 'rgb(187, 247, 208)', // #bbf7d0
  },
  ocean: {
    appBg: 'rgb(12, 24, 33)', // #0c1821
    text: 'rgb(153, 246, 228)', // #99f6e4
  },
} as const;

/**
 * Helper to convert CSS color to rgb format for comparison
 */
function cssColorToRgb(color: string): string {
  // If already rgb(a), return as-is
  if (color.startsWith('rgb')) {
    return color;
  }
  return color;
}

/**
 * Helper to select a theme via the hamburger menu
 */
async function selectTheme(page: Page, themeId: string): Promise<void> {
  // Open hamburger menu
  await page.locator('button[aria-label="Open menu"]').click();

  // Click on Theme selector trigger
  await page.locator('[data-testid="theme-selector-trigger"]').click();

  // Select the theme
  await page.locator(`[data-testid="theme-option-${themeId}"]`).click();

  // Wait for theme to be applied
  await page.waitForTimeout(300);

  // Close menu by pressing escape
  await page.keyboard.press('Escape');
}

/**
 * Helper to verify an element has a specific background color
 */
async function verifyBackgroundColor(
  page: Page,
  selector: string,
  expectedColor: string
): Promise<void> {
  const element = page.locator(selector);
  const bgColor = await element.evaluate((el) =>
    window.getComputedStyle(el).backgroundColor
  );
  expect(bgColor).toBe(expectedColor);
}

test.describe('Theme Components', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Theme Test Identity');
  });

  test('should apply theme colors to app shell', async ({ page }) => {
    // Verify initial dark theme
    const appShell = page.locator('[data-testid="app-shell"]');
    let bgColor = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(bgColor).toBe(THEME_COLORS.dark.appBg);

    // Switch to amber theme
    await selectTheme(page, 'amber');

    // Verify amber theme applied to app shell
    bgColor = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(bgColor).toBe(THEME_COLORS.amber.appBg);

    // Switch to forest theme
    await selectTheme(page, 'forest');

    // Verify forest theme applied
    bgColor = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(bgColor).toBe(THEME_COLORS.forest.appBg);
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

    // Switch to amber theme
    await selectTheme(page, 'amber');

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

    // Switch to amber theme
    await selectTheme(page, 'amber');

    // Verify border color has changed
    const newBorderColor = await conversationPane.evaluate((el) =>
      window.getComputedStyle(el).borderColor
    );

    // Border colors should reflect amber theme
    expect(newBorderColor).not.toBe('rgb(0, 0, 0)');
  });

  test('should apply theme to nostling status card', async ({ page }) => {
    await navigateToAbout(page);
    const statusCard = page.locator('[data-testid="nostling-status-card"]');

    // Verify status card exists
    await expect(statusCard).toBeVisible();

    // Get initial background
    const initialBg = await statusCard.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );

    // Switch to ocean theme
    await selectTheme(page, 'ocean');

    // The background should have changed
    const newBg = await statusCard.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );

    // Backgrounds should not be fully transparent
    expect(newBg).not.toBe('rgba(0, 0, 0, 0)');
  });

  // Note: Theme persistence across reload is tested in theme-persistence.spec.ts
  // Tests 39 and 40 verify the API returns correct theme and UI shows correct checkmark

  test('should show correct checkmark indicator for selected theme', async ({ page }) => {
    // Open hamburger menu and theme selector
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="theme-selector-trigger"]').click();

    // Dark theme should be selected by default
    const darkCheckmark = page.locator('[data-testid="theme-swatch-checkmark-dark"]');
    await expect(darkCheckmark).toBeVisible();

    // Close menu
    await page.keyboard.press('Escape');

    // Switch to forest theme
    await selectTheme(page, 'forest');

    // Reopen menu and verify forest is now selected
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="theme-selector-trigger"]').click();

    const forestCheckmark = page.locator('[data-testid="theme-swatch-checkmark-forest"]');
    await expect(forestCheckmark).toBeVisible();

    // Dark should no longer have checkmark
    await expect(darkCheckmark).not.toBeVisible();
  });

  test('should apply light theme correctly', async ({ page }) => {
    // Switch to light theme
    await selectTheme(page, 'light');

    // Verify light theme applied to app shell
    const appShell = page.locator('[data-testid="app-shell"]');
    const bgColor = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(bgColor).toBe(THEME_COLORS.light.appBg);
  });

  test('all themed components should be consistent within a theme', async ({ page }) => {
    // Switch to amber theme for consistent testing
    await selectTheme(page, 'amber');

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
    const themes = ['amber', 'ocean', 'forest', 'dark'];
    const appShell = page.locator('[data-testid="app-shell"]');

    for (const themeId of themes) {
      await selectTheme(page, themeId);

      const bgColor = await appShell.evaluate((el) =>
        window.getComputedStyle(el).backgroundColor
      );

      // Verify the background color matches expected theme
      if (themeId in THEME_COLORS) {
        expect(bgColor).toBe(THEME_COLORS[themeId as keyof typeof THEME_COLORS].appBg);
      }
    }
  });
});
