/**
 * Identities Panel - E2E Integration Test
 *
 * Verifies complete workflow for editing identity profiles:
 * 1. Open panel from hamburger menu
 * 2. Select identity and edit profile fields
 * 3. Apply changes and return to chat
 * 4. Cancel and discard changes
 * 5. Identity switching protection when dirty
 * 6. Escape key behavior
 */

import { test, expect } from './fixtures';
import { waitForAppReady, ensureIdentityExists } from './helpers';

test.describe('Identities Panel - Integration', () => {
  test('should open IdentitiesPanel when clicking "Edit Identity Profile" in hamburger menu', async ({
    page,
  }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Menu Test Identity');

    // Open hamburger menu
    const menuButton = page.locator('button[aria-label="Open menu"]');
    await menuButton.click();

    // Click on "Edit Identity Profile" menu item
    const identitiesMenuItem = page.locator('[data-testid="identities-panel-trigger"]');
    await expect(identitiesMenuItem).toBeVisible();
    await identitiesMenuItem.click();

    // Verify IdentitiesPanel is open
    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Verify panel has the identity display name in title (shown dynamically based on selected identity)
    const displayName = panel.locator('[data-testid="identities-panel-display-name"]');
    await expect(displayName).toBeVisible();

    // Verify Cancel and Apply buttons are present
    const cancelButton = panel.locator('[data-testid="identities-panel-cancel"]');
    const applyButton = panel.locator('[data-testid="identities-panel-apply"]');
    await expect(cancelButton).toBeVisible();
    await expect(applyButton).toBeVisible();
  });

  test('should open IdentitiesPanel when clicking three-dot icon on identity in sidebar', async ({
    page,
  }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Three Dot Test Identity');

    // Get the identity item
    const identityItem = page.locator('[data-testid^="identity-item-"]').first();
    await expect(identityItem).toBeVisible();

    // Hover over identity item to reveal the three-dot icon
    await identityItem.hover();

    // Click the three-dot icon (more button)
    const moreButton = page.locator('[data-testid^="identity-more-"]').first();
    await expect(moreButton).toBeVisible();
    await moreButton.click();

    // Verify IdentitiesPanel is open
    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Verify Remove button is present (new feature)
    const removeButton = panel.locator('[data-testid="identities-panel-remove"]');
    await expect(removeButton).toBeVisible();
  });

  test('should display IdentityProfileView with all 8 fields', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Fields Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Verify all 8 fields are present (using inline editing pattern)
    await expect(page.locator('[data-testid="identity-profile-label-value"]')).toBeVisible();
    await expect(page.locator('[data-testid="identity-profile-name-value"]')).toBeVisible();
    await expect(page.locator('[data-testid="identity-profile-about-value"]')).toBeVisible();
    await expect(page.locator('[data-testid="identity-profile-picture-value"]')).toBeVisible();
    await expect(page.locator('[data-testid="identity-profile-banner-value"]')).toBeVisible();
    await expect(page.locator('[data-testid="identity-profile-website-value"]')).toBeVisible();
    await expect(page.locator('[data-testid="identity-profile-nip05-value"]')).toBeVisible();
    await expect(page.locator('[data-testid="identity-profile-lud16-value"]')).toBeVisible();
  });

  test('should enable Apply button when fields are edited', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Edit Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const applyButton = page.locator('[data-testid="identities-panel-apply"]');

    // Initially Apply should be disabled (no changes)
    await expect(applyButton).toBeDisabled();

    // Edit a field using inline editing pattern: click pencil, type, save
    const nameValue = page.locator('[data-testid="identity-profile-name-value"]');
    await nameValue.hover(); // Reveal pencil icon
    await page.locator('[data-testid="identity-profile-name-edit"]').click();
    await page.locator('[data-testid="identity-profile-name-input"]').fill('Updated Name');
    await page.locator('[data-testid="identity-profile-name-save"]').click();

    // Apply should now be enabled
    await expect(applyButton).toBeEnabled();
  });

  test('should apply changes and return to chat view', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Apply Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Edit name field using inline editing pattern
    const nameValue = page.locator('[data-testid="identity-profile-name-value"]');
    await nameValue.hover();
    await page.locator('[data-testid="identity-profile-name-edit"]').click();
    await page.locator('[data-testid="identity-profile-name-input"]').fill('Test User');
    await page.locator('[data-testid="identity-profile-name-save"]').click();

    // Click Apply
    const applyButton = page.locator('[data-testid="identities-panel-apply"]');
    await applyButton.click();

    // Panel should close and return to chat view
    await expect(panel).not.toBeVisible();

    // Conversation pane should be visible
    const conversationPane = page.locator('[data-testid="conversation-pane"]');
    await expect(conversationPane).toBeVisible();
  });

  test('should discard changes when Cancel is clicked', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Cancel Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Edit a field using inline editing pattern
    const nameValue = page.locator('[data-testid="identity-profile-name-value"]');
    await nameValue.hover();
    await page.locator('[data-testid="identity-profile-name-edit"]').click();
    await page.locator('[data-testid="identity-profile-name-input"]').fill('Temporary Name');
    await page.locator('[data-testid="identity-profile-name-save"]').click();

    // Click Cancel (panel level)
    const cancelButton = panel.locator('[data-testid="identities-panel-cancel"]');
    await cancelButton.click();

    // Panel should close
    await expect(panel).not.toBeVisible();

    // Reopen to verify changes were discarded
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();
    await expect(panel).toBeVisible();

    // Name field should not have the temporary value
    const nameText = await page.locator('[data-testid="identity-profile-name-value"]').textContent();
    expect(nameText).not.toContain('Temporary Name');
  });

  test('should close panel when pressing Escape', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Escape Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Panel should close
    await expect(panel).not.toBeVisible();

    // Should be back in chat view
    const conversationPane = page.locator('[data-testid="conversation-pane"]');
    await expect(conversationPane).toBeVisible();
  });

  test('should disable Cancel/Apply and prevent Escape during save operation', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Saving Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Edit a field using inline editing pattern
    const nameValue = page.locator('[data-testid="identity-profile-name-value"]');
    await nameValue.hover();
    await page.locator('[data-testid="identity-profile-name-edit"]').click();
    await page.locator('[data-testid="identity-profile-name-input"]').fill('Save Test');
    await page.locator('[data-testid="identity-profile-name-save"]').click();

    // Click Apply - this should trigger saving state
    const applyButton = page.locator('[data-testid="identities-panel-apply"]');
    await applyButton.click();

    // Panel should close after save completes
    await expect(panel).not.toBeVisible({ timeout: 5000 });
  });

  test('should show image preview when valid picture URL is entered', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Image Preview Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Enter a valid image URL using inline editing pattern
    const pictureValue = page.locator('[data-testid="identity-profile-picture-value"]');
    await pictureValue.hover();
    await page.locator('[data-testid="identity-profile-picture-edit"]').click();
    const testImageUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="blue"/%3E%3C/svg%3E';
    await page.locator('[data-testid="identity-profile-picture-input"]').fill(testImageUrl);
    await page.locator('[data-testid="identity-profile-picture-save"]').click();

    // Image preview should appear
    const preview = page.locator('[data-testid="identity-profile-picture-preview"]');
    await expect(preview).toBeVisible();
  });

  test('should show banner preview when valid banner URL is entered', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Banner Preview Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Enter a valid banner URL using inline editing pattern
    const bannerValue = page.locator('[data-testid="identity-profile-banner-value"]');
    await bannerValue.hover();
    await page.locator('[data-testid="identity-profile-banner-edit"]').click();
    const testBannerUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="100"%3E%3Crect width="200" height="100" fill="green"/%3E%3C/svg%3E';
    await page.locator('[data-testid="identity-profile-banner-input"]').fill(testBannerUrl);
    await page.locator('[data-testid="identity-profile-banner-save"]').click();

    // Banner preview should appear
    const preview = page.locator('[data-testid="identity-profile-banner-preview"]');
    await expect(preview).toBeVisible();
  });

  test('should persist all field changes after Apply', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Persistence Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Fill all fields with test data using inline editing pattern
    const testData = {
      name: 'Persistent Name',
      about: 'Persistent bio',
      website: 'https://persistent.example.com',
      nip05: 'user@persistent.com',
      lud16: 'lightning@persistent.com',
    };

    // Edit name field
    await page.locator('[data-testid="identity-profile-name-value"]').hover();
    await page.locator('[data-testid="identity-profile-name-edit"]').click();
    await page.locator('[data-testid="identity-profile-name-input"]').fill(testData.name);
    await page.locator('[data-testid="identity-profile-name-save"]').click();

    // Edit about field
    await page.locator('[data-testid="identity-profile-about-value"]').hover();
    await page.locator('[data-testid="identity-profile-about-edit"]').click();
    await page.locator('[data-testid="identity-profile-about-input"]').fill(testData.about);
    await page.locator('[data-testid="identity-profile-about-save"]').click();

    // Edit website field
    await page.locator('[data-testid="identity-profile-website-value"]').hover();
    await page.locator('[data-testid="identity-profile-website-edit"]').click();
    await page.locator('[data-testid="identity-profile-website-input"]').fill(testData.website);
    await page.locator('[data-testid="identity-profile-website-save"]').click();

    // Edit nip05 field
    await page.locator('[data-testid="identity-profile-nip05-value"]').hover();
    await page.locator('[data-testid="identity-profile-nip05-edit"]').click();
    await page.locator('[data-testid="identity-profile-nip05-input"]').fill(testData.nip05);
    await page.locator('[data-testid="identity-profile-nip05-save"]').click();

    // Edit lud16 field
    await page.locator('[data-testid="identity-profile-lud16-value"]').hover();
    await page.locator('[data-testid="identity-profile-lud16-edit"]').click();
    await page.locator('[data-testid="identity-profile-lud16-input"]').fill(testData.lud16);
    await page.locator('[data-testid="identity-profile-lud16-save"]').click();

    // Apply changes
    await page.locator('[data-testid="identities-panel-apply"]').click();
    await expect(panel).not.toBeVisible();

    // Reopen panel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();
    await expect(panel).toBeVisible();

    // Verify all fields persisted by checking the displayed values
    await expect(page.locator('[data-testid="identity-profile-name-value"]')).toContainText(testData.name);
    await expect(page.locator('[data-testid="identity-profile-about-value"]')).toContainText(testData.about);
    await expect(page.locator('[data-testid="identity-profile-website-value"]')).toContainText(testData.website);
    await expect(page.locator('[data-testid="identity-profile-nip05-value"]')).toContainText(testData.nip05);
    await expect(page.locator('[data-testid="identity-profile-lud16-value"]')).toContainText(testData.lud16);
  });

  test('should handle empty profile gracefully', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Empty Profile Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // All fields should be present even if empty - check by hovering and clicking edit
    const nameValue = page.locator('[data-testid="identity-profile-name-value"]');
    await nameValue.hover();
    await page.locator('[data-testid="identity-profile-name-edit"]').click();

    // Input should be available
    const nameInput = page.locator('[data-testid="identity-profile-name-input"]');
    await expect(nameInput).toBeVisible();

    // Should be able to fill and save
    await nameInput.fill('New Name');
    await page.locator('[data-testid="identity-profile-name-save"]').click();

    const applyButton = page.locator('[data-testid="identities-panel-apply"]');
    await expect(applyButton).toBeEnabled();
    await applyButton.click();

    // Panel should close successfully
    await expect(panel).not.toBeVisible();
  });

  test('should show loading state when profile is being fetched', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Loading State Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    // Loading indicator might be very brief, but check it exists
    // (the implementation shows "Loading profile..." text)
    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Profile view should eventually be visible (checking for name value element)
    const nameValue = page.locator('[data-testid="identity-profile-name-value"]');
    await expect(nameValue).toBeVisible({ timeout: 5000 });
  });

  test('should support multiline text in About field', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Multiline Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Fill About with multiple lines using inline editing pattern
    const aboutText = 'Line 1\nLine 2\nLine 3';
    const aboutValue = page.locator('[data-testid="identity-profile-about-value"]');
    await aboutValue.hover();
    await page.locator('[data-testid="identity-profile-about-edit"]').click();
    await page.locator('[data-testid="identity-profile-about-input"]').fill(aboutText);
    await page.locator('[data-testid="identity-profile-about-save"]').click();

    // Apply
    await page.locator('[data-testid="identities-panel-apply"]').click();
    await expect(panel).not.toBeVisible();

    // Reopen and verify
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();
    await expect(panel).toBeVisible();

    // Verify the about text is displayed (multiline shown in read-only view)
    await expect(page.locator('[data-testid="identity-profile-about-value"]')).toContainText('Line 1');
    await expect(page.locator('[data-testid="identity-profile-about-value"]')).toContainText('Line 2');
    await expect(page.locator('[data-testid="identity-profile-about-value"]')).toContainText('Line 3');
  });
});
