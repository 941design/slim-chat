/**
 * Theme Selection Panel Component
 *
 * Panel view for theme selection with carousel preview.
 * Variable sliders are rendered in the sidebar, not here.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Flex,
} from '@chakra-ui/react';
import { ThemeId, getAllThemes } from '../../themes/definitions';
import { resolveTheme } from '../../themes/loader';
import { ThemeCarousel } from './ThemeCarousel';
import { SubPanel } from '../SubPanel';
import type { ThemeSemanticColors } from '../../themes/useTheme';

/**
 * Preview typography from slider generation
 */
export interface PreviewTypography {
  fonts?: { body: string; heading: string; mono: string };
  fontSizes?: Record<string, string>;
}

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
   * Only called when user clicks Apply
   */
  onThemeApply: (themeId: ThemeId) => Promise<void>;

  /**
   * Callback when user cancels theme selection
   */
  onCancel: () => void;

  /**
   * Custom colors from slider generation (managed by parent)
   */
  customColors?: ThemeSemanticColors | null;

  /**
   * Preview typography from slider generation (only applied to preview, not global)
   */
  previewTypography?: PreviewTypography | null;

  /**
   * Callback when staged theme changes (for parent to track)
   */
  onStagedThemeChange?: (themeId: ThemeId) => void;
}

/**
 * Theme Selection Panel Component
 *
 * Displays the theme carousel/preview in the main panel area.
 * Cancel/Apply buttons are in the SubPanel header.
 * Theme variable sliders are rendered in the sidebar (not part of this component).
 */
export function ThemeSelectionPanel({
  currentTheme,
  identityId,
  onThemeApply,
  onCancel,
  customColors,
  previewTypography,
  onStagedThemeChange,
}: ThemeSelectionPanelProps): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);

  // Staging state: preserve original theme on mount
  const [originalTheme, setOriginalTheme] = useState<ThemeId>(currentTheme);
  const [stagedTheme, setStagedTheme] = useState<ThemeId>(currentTheme);

  // Loading state for theme application
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // All available themes (no filtering)
  const availableThemes = useMemo(() => getAllThemes(), []);

  // Initialize on mount and when currentTheme changes
  useEffect(() => {
    setOriginalTheme(currentTheme);
    setStagedTheme(currentTheme);
    setError(null);
    setIsApplying(false);

    // Auto-focus panel for keyboard navigation
    setTimeout(() => {
      panelRef.current?.focus();
    }, 0);
  }, [currentTheme]);

  // Handle carousel navigation - notify parent of theme change
  // Typography is NOT applied globally here; preview shows the preset theme's fonts
  const handleThemeChange = useCallback((themeId: ThemeId) => {
    setStagedTheme(themeId);
    onStagedThemeChange?.(themeId);
  }, [onStagedThemeChange]);

  // Handle Apply click - apply typography globally then persist theme
  const handleApply = useCallback(async () => {
    setIsApplying(true);
    try {
      // Apply typography CSS variables globally
      const root = document.documentElement;

      if (previewTypography) {
        // User customized typography via sliders - apply their choices
        if (previewTypography.fontSizes) {
          for (const [key, value] of Object.entries(previewTypography.fontSizes)) {
            root.style.setProperty(`--app-font-size-${key}`, value);
          }
        }
        if (previewTypography.fonts) {
          for (const [key, value] of Object.entries(previewTypography.fonts)) {
            root.style.setProperty(`--app-font-${key}`, value);
          }
        }
      } else {
        // No custom typography - apply the staged theme's default typography
        const theme = resolveTheme(stagedTheme);
        if (theme.typography?.fontSizes) {
          for (const [key, value] of Object.entries(theme.typography.fontSizes)) {
            root.style.setProperty(`--app-font-size-${key}`, value);
          }
        }
        if (theme.typography?.fonts) {
          for (const [key, value] of Object.entries(theme.typography.fonts)) {
            root.style.setProperty(`--app-font-${key}`, value);
          }
        }
      }

      await onThemeApply(stagedTheme);
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply theme');
      setIsApplying(false);
    }
  }, [stagedTheme, previewTypography, onThemeApply, onCancel]);

  // Handle keyboard navigation (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isApplying) {
        onCancel();
      } else if (e.key === 'ArrowLeft' && !isApplying && availableThemes.length > 0) {
        e.preventDefault();
        const currentIndex = availableThemes.findIndex((t) => t.id === stagedTheme);
        const previousIndex = (currentIndex - 1 + availableThemes.length) % availableThemes.length;
        const newTheme = availableThemes[previousIndex].id;
        setStagedTheme(newTheme);
        onStagedThemeChange?.(newTheme);
      } else if (e.key === 'ArrowRight' && !isApplying && availableThemes.length > 0) {
        e.preventDefault();
        const currentIndex = availableThemes.findIndex((t) => t.id === stagedTheme);
        const nextIndex = (currentIndex + 1) % availableThemes.length;
        const newTheme = availableThemes[nextIndex].id;
        setStagedTheme(newTheme);
        onStagedThemeChange?.(newTheme);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isApplying, availableThemes, stagedTheme, onStagedThemeChange]);

  // Handle keyboard events directly on the panel
  const handlePanelKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape' && !isApplying) {
      onCancel();
    } else if (e.key === 'ArrowLeft' && !isApplying && availableThemes.length > 0) {
      e.preventDefault();
      const currentIndex = availableThemes.findIndex((t) => t.id === stagedTheme);
      const previousIndex = (currentIndex - 1 + availableThemes.length) % availableThemes.length;
      const newTheme = availableThemes[previousIndex].id;
      setStagedTheme(newTheme);
      onStagedThemeChange?.(newTheme);
    } else if (e.key === 'ArrowRight' && !isApplying && availableThemes.length > 0) {
      e.preventDefault();
      const currentIndex = availableThemes.findIndex((t) => t.id === stagedTheme);
      const nextIndex = (currentIndex + 1) % availableThemes.length;
      const newTheme = availableThemes[nextIndex].id;
      setStagedTheme(newTheme);
      onStagedThemeChange?.(newTheme);
    }
  };

  const actions = [
    {
      label: 'Cancel',
      onClick: onCancel,
      variant: 'ghost' as const,
      disabled: isApplying,
      testId: 'theme-panel-cancel',
    },
    {
      label: isApplying ? 'Applying...' : 'Apply',
      onClick: handleApply,
      variant: 'outline' as const,
      colorPalette: 'blue' as const,
      disabled: isApplying,
      testId: 'theme-panel-ok',
    },
  ];

  return (
    <SubPanel
      title="Select Theme"
      actions={actions}
      testId="theme-selection-panel"
    >
      <Flex
        ref={panelRef}
        tabIndex={0}
        onKeyDown={handlePanelKeyDown}
        direction="column"
        align="center"
        justify="center"
        flex={1}
        outline="none"
        gap={6}
        h="100%"
      >
        {availableThemes.length > 0 && (
          <ThemeCarousel
            currentTheme={stagedTheme}
            availableThemes={availableThemes}
            onThemeChange={handleThemeChange}
            disabled={isApplying}
            customColors={customColors ?? undefined}
            previewTypography={previewTypography ?? undefined}
          />
        )}

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
      </Flex>
    </SubPanel>
  );
}
