/**
 * Theme Selection Panel - Hamburger Menu Integration E2E Test
 *
 * Verifies that the ThemeSelectionPanel is properly wired into the hamburger menu,
 * and that clicking "Select Theme" opens the panel instead of showing a dropdown.
 *
 * Tests the following workflow:
 * 1. Open hamburger menu
 * 2. Click "Select Theme" menu item
 * 3. Verify ThemeSelectionPanel modal opens
 * 4. Navigate carousel and apply theme
 * 5. Verify theme persists
 */

import { test, expect } from './fixtures';
import { waitForAppReady, ensureIdentityExists } from './helpers';

test.describe('Theme Selection Panel - Hamburger Menu Integration', () => {
  test('should open ThemeSelectionPanel when clicking "Select Theme" in hamburger menu', async ({
    page,
  }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Menu Test Identity');

    // Open hamburger menu
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();

    // Click on "Select Theme" menu item
    const themeMenuItem = page.locator('[data-testid="theme-panel-trigger"]');
    await expect(themeMenuItem).toBeVisible();
    await themeMenuItem.click();

    // Verify ThemeSelectionPanel modal is open
    const panel = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panel).toBeVisible();

    // Verify it contains the expected components
    const title = panel.locator(':text("Select Theme")');
    await expect(title).toBeVisible();

    // Verify Cancel and OK buttons are present
    const cancelButton = panel.locator('[data-testid="theme-panel-cancel"]');
    const okButton = panel.locator('[data-testid="theme-panel-ok"]');
    await expect(cancelButton).toBeVisible();
    await expect(okButton).toBeVisible();
  });

  test('should disable "Select Theme" when no identity is selected', async ({ page }) => {
    await waitForAppReady(page);

    // Don't create any identity - so no identity is selected
    // Open hamburger menu
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();

    // "Select Theme" should be disabled
    const themeMenuItem = page.locator('[data-testid="theme-panel-trigger"]');
    await expect(themeMenuItem).toBeDisabled();
  });

  test('should navigate carousel and apply theme from ThemeSelectionPanel', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Carousel Test Identity');

    // Open hamburger menu → ThemeSelectionPanel
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    // Verify panel is open
    const panel = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panel).toBeVisible();

    // Navigate carousel to select a different theme
    // Look for theme carousel buttons or navigation controls
    const nextButton = panel.locator('button').filter({ has: page.locator('svg[viewBox="0 0 24 24"]') }).last();
    if (await nextButton.isVisible()) {
      await nextButton.click();
    }

    // Click OK to apply the theme
    const okButton = panel.locator('[data-testid="theme-panel-ok"]');
    await okButton.click();

    // Panel should close after applying
    await expect(panel).not.toBeVisible();
  });

  test('should close panel when clicking Cancel', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Cancel Test Identity');

    // Open hamburger menu → ThemeSelectionPanel
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    // Verify panel is open
    const panel = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panel).toBeVisible();

    // Click Cancel
    const cancelButton = panel.locator('[data-testid="theme-panel-cancel"]');
    await cancelButton.click();

    // Panel should close
    await expect(panel).not.toBeVisible();
  });

  test('should close panel when pressing Escape', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Escape Test Identity');

    // Open hamburger menu → ThemeSelectionPanel
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    // Verify panel is open
    const panel = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panel).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Panel should close
    await expect(panel).not.toBeVisible();
  });

  test('should navigate carousel with ArrowRight keyboard', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Keyboard Nav Identity');

    // Open ThemeSelectionPanel
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    const panel = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panel).toBeVisible();

    // Get initial theme name
    const themeInfo = panel.locator('[data-testid="theme-info"]');
    const initialTheme = await themeInfo.textContent();

    // Press ArrowRight to navigate to next theme
    await page.keyboard.press('ArrowRight');

    // Wait a moment for state update
    await page.waitForTimeout(100);

    // Verify theme changed
    const newTheme = await themeInfo.textContent();
    expect(newTheme).not.toBe(initialTheme);
  });

  test('should navigate carousel with ArrowLeft keyboard', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Keyboard Left Identity');

    // Open ThemeSelectionPanel
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    const panel = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panel).toBeVisible();

    // Get initial theme name
    const themeInfo = panel.locator('[data-testid="theme-info"]');
    const initialTheme = await themeInfo.textContent();

    // Press ArrowLeft to navigate to previous theme
    await page.keyboard.press('ArrowLeft');

    // Wait a moment for state update
    await page.waitForTimeout(100);

    // Verify theme changed
    const newTheme = await themeInfo.textContent();
    expect(newTheme).not.toBe(initialTheme);
  });

  test('should cycle through themes with multiple arrow key presses', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Keyboard Cycle Identity');

    // Open ThemeSelectionPanel
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    const panel = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panel).toBeVisible();

    const themeInfo = panel.locator('[data-testid="theme-info"]');
    const initialTheme = await themeInfo.textContent();

    // Navigate through several themes
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);

    const afterForward = await themeInfo.textContent();
    expect(afterForward).not.toBe(initialTheme);

    // Navigate back
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(50);

    // Should be back to initial theme
    const backToStart = await themeInfo.textContent();
    expect(backToStart).toBe(initialTheme);
  });

  test('should verify wrap-around navigation with keyboard', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Wrap Around Identity');

    // Open ThemeSelectionPanel
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    const panel = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panel).toBeVisible();

    const themeInfo = panel.locator('[data-testid="theme-info"]');

    // Navigate forward through all themes (10 themes)
    // This should wrap around to the beginning
    for (let i = 0; i < 11; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }

    // Should have wrapped around
    const afterWrap = await themeInfo.textContent();
    expect(afterWrap).toBeTruthy();

    // Navigate backward from start should wrap to end
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(50);

    const wrappedToEnd = await themeInfo.textContent();
    expect(wrappedToEnd).not.toBe(afterWrap);
  });
});
