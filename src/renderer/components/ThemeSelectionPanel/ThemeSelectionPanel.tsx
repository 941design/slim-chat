/**
 * Theme Selection Panel Component
 *
 * Panel view for theme selection with carousel preview, filtering, and staging.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Button,
  VStack,
  HStack,
  Box,
  Heading,
  Spacer,
} from '@chakra-ui/react';
import { ThemeId, getAllThemes, ThemeMetadata } from '../../themes/definitions';
import { ThemeFilters } from './ThemeFilters';
import { ThemeCarousel } from './ThemeCarousel';
import { ThemeInfo } from './ThemeInfo';
import { filterThemes } from './filterThemes';
import { ThemeFilters as ThemeFiltersType } from './types';
import { useThemeColors } from '../../themes/ThemeContext';

export interface ThemeSelectionPanelProps {
  /**
   * Currently active theme in main app
   */
  currentTheme: ThemeId;

  /**
   * Current identity ID for persistence
   */
  identityId: string | null;

  /**
   * Callback to persist theme change
   * Only called when user clicks OK
   */
  onThemeApply: (themeId: ThemeId) => Promise<void>;

  /**
   * Callback when user cancels theme selection
   */
  onCancel: () => void;
}

/**
 * Theme Selection Panel Component
 *
 * CONTRACT:
 *   Inputs:
 *     - currentTheme: ThemeId of theme active in main app
 *     - identityId: string identifier for current identity, null if no identity
 *     - onThemeApply: async callback to persist theme selection (IPC call)
 *     - onCancel: callback function to return to previous view
 *
 *   Outputs:
 *     - React element containing:
 *       * VStack panel container (max width 900px, centered)
 *       * Header with "Select Theme" heading
 *       * ThemeFilters component for brightness and color family filtering
 *       * ThemeCarousel component for theme browsing with preview
 *       * ThemeInfo component showing theme metadata
 *       * Error display if theme application fails
 *       * Footer with Cancel and OK buttons
 *
 *   Invariants:
 *     - Panel tracks two themes: originalTheme (initial value), stagedTheme (during browsing)
 *     - Browsing carousel updates stagedTheme only, not main app theme
 *     - Clicking OK calls onThemeApply(stagedTheme) then calls onCancel to close panel
 *     - Clicking Cancel calls onCancel without persisting changes
 *     - Pressing Escape key calls onCancel (same as Cancel button)
 *     - OK button disabled while theme is being applied (isApplying state)
 *     - Filters reset to 'all' on component mount
 *     - Panel remembers originalTheme even if main app theme changes during browsing
 *
 *   Properties:
 *     - Staging isolation: browsing themes does not affect main app until OK clicked
 *     - Atomicity: theme change either fully succeeds (OK) or no change occurs (Cancel)
 *     - Idempotency: clicking OK when stagedTheme equals originalTheme is valid (no-op in main app)
 *     - Error resilience: if onThemeApply throws error, panel remains open with error displayed
 *     - Accessibility: keyboard navigable via Tab, Arrow keys (carousel), Enter (OK), Escape (Cancel)
 *     - Initialization: panel initializes filters and theme state on mount and when currentTheme prop changes
 *
 *   Algorithm:
 *     On mount or currentTheme change:
 *       1. Store currentTheme as originalTheme
 *       2. Initialize stagedTheme to currentTheme
 *       3. Initialize filters to {brightness: 'all', colorFamily: 'all'}
 *       4. Clear error state
 *       5. Set isApplying to false
 *       6. Fetch all themes from getAllThemes()
 *       7. Apply filters to get initial availableThemes list
 *
 *     On carousel navigation:
 *       1. Update stagedTheme to newly selected theme
 *       2. Preview shows stagedTheme
 *       3. Do NOT call onThemeApply
 *
 *     On filter change:
 *       1. Update filters state
 *       2. Recalculate availableThemes by filtering all themes
 *       3. If stagedTheme not in availableThemes:
 *          a. Set stagedTheme to first theme in availableThemes
 *       4. Carousel shows filtered list
 *
 *     On OK click:
 *       1. Set isApplying to true (disable OK button)
 *       2. Call onThemeApply(stagedTheme)
 *       3. If success: call onCancel to close panel
 *       4. If error: display error message, set isApplying to false, keep panel open
 *
 *     On Cancel click or Escape:
 *       1. Call onCancel callback
 *       2. Do NOT call onThemeApply
 *       3. Main app theme remains unchanged
 *
 *     Keyboard support:
 *       - Left/Right arrows: navigate carousel (handled by ThemeCarousel component)
 *       - Enter: focus OK button if focused, otherwise handled by carousel
 *       - Escape: call onCancel (always works unless theme is applying)
 */
export function ThemeSelectionPanel({
  currentTheme,
  identityId,
  onThemeApply,
  onCancel,
}: ThemeSelectionPanelProps): React.ReactElement {
  const colors = useThemeColors();
  const panelRef = useRef<HTMLDivElement>(null);

  // Staging state: preserve original theme on mount
  const [originalTheme, setOriginalTheme] = useState<ThemeId>(currentTheme);
  const [stagedTheme, setStagedTheme] = useState<ThemeId>(currentTheme);

  // Filter state
  const [filters, setFilters] = useState<ThemeFiltersType>({
    brightness: 'all',
    colorFamily: 'all',
  });

  // Loading state for theme application
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available themes (filtered)
  const [availableThemes, setAvailableThemes] = useState<ThemeMetadata[]>([]);

  // Initialize on mount and when currentTheme changes
  useEffect(() => {
    setOriginalTheme(currentTheme);
    setStagedTheme(currentTheme);
    setFilters({ brightness: 'all', colorFamily: 'all' });
    setError(null);
    setIsApplying(false);

    // Get all themes and apply initial filters
    const allThemes = getAllThemes();
    const filtered = filterThemes(allThemes, { brightness: 'all', colorFamily: 'all' });
    setAvailableThemes(filtered);

    // Auto-focus panel for keyboard navigation
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      panelRef.current?.focus();
    }, 0);
  }, [currentTheme]);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: ThemeFiltersType) => {
    setFilters(newFilters);

    // Recalculate available themes
    const allThemes = getAllThemes();
    const filtered = filterThemes(allThemes, newFilters);
    setAvailableThemes(filtered);

    // If staged theme not in filtered list, switch to first available
    if (filtered.length > 0) {
      const stagedThemeInFiltered = filtered.find((t) => t.id === stagedTheme);
      if (!stagedThemeInFiltered) {
        setStagedTheme(filtered[0].id);
      }
    }
  }, [stagedTheme]);

  // Handle carousel navigation
  const handleThemeChange = useCallback((themeId: ThemeId) => {
    setStagedTheme(themeId);
  }, []);

  // Handle OK click - apply theme
  const handleOk = useCallback(async () => {
    setIsApplying(true);
    try {
      await onThemeApply(stagedTheme);
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply theme');
      setIsApplying(false);
    }
  }, [stagedTheme, onThemeApply, onCancel]);

  // Handle keyboard navigation (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isApplying) {
        onCancel();
      } else if (e.key === 'ArrowLeft' && !isApplying && availableThemes.length > 0) {
        e.preventDefault();
        const currentIndex = availableThemes.findIndex((t) => t.id === stagedTheme);
        const previousIndex = (currentIndex - 1 + availableThemes.length) % availableThemes.length;
        setStagedTheme(availableThemes[previousIndex].id);
      } else if (e.key === 'ArrowRight' && !isApplying && availableThemes.length > 0) {
        e.preventDefault();
        const currentIndex = availableThemes.findIndex((t) => t.id === stagedTheme);
        const nextIndex = (currentIndex + 1) % availableThemes.length;
        setStagedTheme(availableThemes[nextIndex].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isApplying, availableThemes, stagedTheme]);

  // Get current theme metadata for display
  const currentThemeMetadata = availableThemes.find((t) => t.id === stagedTheme) ||
    getAllThemes().find((t) => t.id === stagedTheme) || {
      id: stagedTheme,
      name: 'Unknown',
      description: '',
      previewColors: { primary: '#000', background: '#fff', text: '#000' },
    };

  // Handle keyboard events directly on the panel
  const handlePanelKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape' && !isApplying) {
      onCancel();
    } else if (e.key === 'ArrowLeft' && !isApplying && availableThemes.length > 0) {
      e.preventDefault();
      const currentIndex = availableThemes.findIndex((t) => t.id === stagedTheme);
      const previousIndex = (currentIndex - 1 + availableThemes.length) % availableThemes.length;
      setStagedTheme(availableThemes[previousIndex].id);
    } else if (e.key === 'ArrowRight' && !isApplying && availableThemes.length > 0) {
      e.preventDefault();
      const currentIndex = availableThemes.findIndex((t) => t.id === stagedTheme);
      const nextIndex = (currentIndex + 1) % availableThemes.length;
      setStagedTheme(availableThemes[nextIndex].id);
    }
  };

  return (
    <VStack
      ref={panelRef}
      tabIndex={0}
      onKeyDown={handlePanelKeyDown}
      align="stretch"
      gap={6}
      p={4}
      bg={colors.surfaceBg}
      borderRadius="md"
      width="100%"
      maxW="900px"
      mx="auto"
      data-testid="theme-selection-panel"
      outline="none"
    >
      <HStack justify="space-between">
        <Heading size="sm" color={colors.text}>
          Select Theme
        </Heading>
        <Spacer />
      </HStack>

      <ThemeFilters filters={filters} onFilterChange={handleFilterChange} />

      {availableThemes.length > 0 && (
        <ThemeCarousel
          currentTheme={stagedTheme}
          availableThemes={availableThemes}
          onThemeChange={handleThemeChange}
          disabled={isApplying}
        />
      )}

      <ThemeInfo
        theme={currentThemeMetadata as ThemeMetadata}
        isCurrentTheme={stagedTheme === originalTheme}
      />

      {error && (
        <Box
          bg="rgb(239, 68, 68)"
          color="#fecaca"
          p={3}
          borderRadius="md"
          data-testid="theme-panel-error"
        >
          {error}
        </Box>
      )}

      <HStack justify="flex-end" gap={3}>
        <Button
          variant="outline"
          onClick={onCancel}
          data-testid="theme-panel-cancel"
          disabled={isApplying}
        >
          Cancel
        </Button>
        <Button
          colorPalette="blue"
          onClick={handleOk}
          data-testid="theme-panel-ok"
          disabled={isApplying}
        >
          {isApplying ? 'Applying...' : 'OK'}
        </Button>
      </HStack>
    </VStack>
  );
}
