/**
 * Theme Selection Sidebar Initialization E2E Test
 *
 * Verifies that when entering theme selection mode, the sidebar immediately
 * displays the current theme info (name/description) without requiring
 * any carousel navigation or slider interaction.
 */

import { test, expect } from './fixtures';
import { waitForAppReady, ensureIdentityExists } from './helpers';

test.describe('Theme Selection Sidebar Initialization', () => {
  test('sidebar should show theme info immediately when opening theme selection', async ({
    page,
  }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Sidebar Init Test');

    // Open hamburger menu → ThemeSelectionPanel
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    // Verify panel is open
    const panel = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panel).toBeVisible();

    // Sidebar should immediately show theme info WITHOUT any carousel navigation
    const sidebar = page.locator('[data-testid="app-sidebar"]');
    const themeInfo = sidebar.locator('[data-testid="theme-info"]');

    // This is the key assertion - theme info should be visible immediately
    await expect(themeInfo).toBeVisible({ timeout: 1000 });

    // Verify the theme name is displayed
    const themeName = themeInfo.locator('[data-testid="theme-info-name"]');
    await expect(themeName).toBeVisible();
    await expect(themeName).not.toBeEmpty();

    // Verify the theme description is displayed
    const themeDescription = themeInfo.locator('[data-testid="theme-info-description"]');
    await expect(themeDescription).toBeVisible();
    await expect(themeDescription).not.toBeEmpty();
  });

  test('sidebar theme info should update when navigating carousel', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Sidebar Nav Test');

    // Open hamburger menu → ThemeSelectionPanel
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    const panel = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panel).toBeVisible();

    // Get initial theme name
    const sidebar = page.locator('[data-testid="app-sidebar"]');
    const themeName = sidebar.locator('[data-testid="theme-info-name"]');
    await expect(themeName).toBeVisible();
    const initialThemeName = await themeName.textContent();

    // Navigate carousel to next theme
    const nextButton = page.locator('[data-testid="theme-carousel-next"]');
    await nextButton.click();

    // Theme name should have changed
    await expect(themeName).not.toHaveText(initialThemeName!);
  });

  test('sidebar should show "Custom Theme" when sliders are modified', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Sidebar Custom Test');

    // Open hamburger menu → ThemeSelectionPanel
    const menuButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await menuButton.click();
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    const panel = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panel).toBeVisible();

    // Find a slider and modify it
    const sidebar = page.locator('[data-testid="app-sidebar"]');
    const sliders = sidebar.locator('[data-testid="theme-variable-sliders"]');
    await expect(sliders).toBeVisible();

    // Interact with Base Hue slider (first slider in the list)
    // The slider thumb can be dragged to change the value
    const sliderTrack = sliders.locator('.chakra-slider__track').first();
    if (await sliderTrack.isVisible()) {
      const box = await sliderTrack.boundingBox();
      if (box) {
        // Click near the end of the slider to change the value
        await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
      }
    }

    // After modifying sliders, sidebar should show "Custom Theme"
    const themeName = sidebar.locator('[data-testid="theme-info-name"]');
    await expect(themeName).toHaveText('Custom Theme');
  });
});
