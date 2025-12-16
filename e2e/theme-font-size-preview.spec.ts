/**
 * Theme Font Size Preview E2E Tests
 *
 * Tests that font size slider changes are reflected in the theme preview.
 */

import { test, expect } from './fixtures';
import { waitForAppReady, ensureIdentityExists } from './helpers';

test.describe('Theme Font Size Preview', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Font Size Test Identity');
  });

  test('should update preview font size when font size slider changes', async ({ page }) => {
    // Open hamburger menu
    await page.locator('button[aria-label="Open menu"]').click();
    await page.waitForTimeout(100);

    // Click on Theme panel trigger
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    // Wait for theme panel to open
    await page.waitForSelector('[data-testid="theme-selection-panel"]', { timeout: 5000 });

    // Wait for theme preview to be visible
    const themePreview = page.locator('[data-testid="theme-preview"]');
    await expect(themePreview).toBeVisible();

    // Find the mock conversation section in the preview (has message bubbles)
    const mockConversation = themePreview.locator('[data-testid="mock-conversation-section"]');
    await expect(mockConversation).toBeVisible();

    // Get initial font size from a message bubble in the preview
    const messageBubble = themePreview.locator('[data-testid="preview-message-received"]');
    await expect(messageBubble).toBeVisible();

    const initialFontSize = await messageBubble.evaluate((el) => {
      return window.getComputedStyle(el).fontSize;
    });

    // Find the font size slider
    // The sliders are in order: Base Hue, Accent Offset, Saturation Min, Saturation Max,
    // Lightness Min, Lightness Max, Contrast, Font Size
    // So Font Size is the 8th slider (index 7)
    const sliderContainer = page.locator('[data-testid="theme-variable-sliders"]');
    await expect(sliderContainer).toBeVisible();

    // Get all slider thumbs (role="slider") within the container
    const allSliders = sliderContainer.locator('[role="slider"]');
    const fontSizeSlider = allSliders.nth(7); // 8th slider (0-indexed)

    // Get initial slider value
    const initialSliderValue = await fontSizeSlider.getAttribute('aria-valuenow');

    // Focus and use keyboard to increase the slider value
    await fontSizeSlider.focus();

    // Press right arrow multiple times to increase font size factor
    // Each step is 0.05, so 8 presses goes from 1.0 to 1.4
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }

    // Get new slider value to verify it changed
    const newSliderValue = await fontSizeSlider.getAttribute('aria-valuenow');

    // Verify slider value actually changed
    expect(parseFloat(newSliderValue || '0')).toBeGreaterThan(parseFloat(initialSliderValue || '0'));

    // Wait for the preview to update
    await page.waitForTimeout(200);

    // Get the new font size from the preview
    const newFontSize = await messageBubble.evaluate((el) => {
      return window.getComputedStyle(el).fontSize;
    });

    // Parse font sizes to compare (e.g., "16px" -> 16)
    const initialSize = parseFloat(initialFontSize);
    const newSize = parseFloat(newFontSize);

    // The new font size should be larger than the initial size
    // since we increased the font size factor
    expect(newSize).toBeGreaterThan(initialSize);

    // Cancel to close the panel
    await page.locator('[data-testid="theme-panel-cancel"]').click();
  });
});
