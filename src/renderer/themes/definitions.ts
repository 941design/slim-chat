/**
 * Theme Definitions
 *
 * Re-exports theme types and utilities from the JSON-based theme system.
 * Maintains backward compatibility with existing code.
 *
 * Semantic tokens defined per theme:
 * - appBg: Main application shell background
 * - surfaceBg: Cards, panels, header, footer backgrounds
 * - surfaceBgSubtle: Subtle surface backgrounds (hover states)
 * - surfaceBgSelected: Selected item backgrounds
 * - menuBg: Dropdown menu backgrounds
 * - border: Primary border color
 * - borderSubtle: Subtle border color
 * - text: Primary text color
 * - textMuted: Secondary/muted text color
 * - textSubtle: Most muted text (hints, timestamps)
 * - statusSuccess: Success indicator color
 * - statusWarning: Warning indicator color
 * - statusError: Error indicator color
 * - statusInfo: Info indicator color
 * - buttonPrimaryBg/Text/Hover: Primary button colors
 * - buttonSecondaryBg/Text/Hover: Secondary button colors
 * - buttonDangerBg/Text/Hover: Danger button colors
 * - inputBg/Border/Focus: Input field colors
 * - link/linkHover: Link colors
 */

import { defineConfig } from '@chakra-ui/react';
import {
  type ThemeId as SchemaThemeId,
  type SemanticColors,
  type ResolvedTheme,
  type ColorFamily,
  type ThemeBrightness,
} from './schema';
import {
  resolveTheme,
  getAllThemeIds,
  getSemanticColors as loaderGetSemanticColors,
  getThemeMetadata,
  isValidThemeId as loaderIsValidThemeId,
} from './loader';

/**
 * Theme identifier - all available themes
 */
export type ThemeId = SchemaThemeId;

/**
 * Theme metadata for UI display
 */
export interface ThemeMetadata {
  id: ThemeId;
  name: string;
  description: string;
  previewColors: {
    primary: string;
    background: string;
    text: string;
  };
  colorFamily?: ColorFamily;
  brightness?: ThemeBrightness;
}

/**
 * Semantic color palette for consistent theming across all components
 * Extended with status, button, input, and link colors
 */
export type ThemeSemanticColors = SemanticColors;

/**
 * Complete theme definition including Chakra config
 */
export interface ThemeDefinition {
  metadata: ThemeMetadata;
  config: ReturnType<typeof defineConfig>;
  semanticColors: ThemeSemanticColors;
}

/**
 * Convert resolved theme to legacy ThemeDefinition format
 */
function toThemeDefinition(theme: ResolvedTheme): ThemeDefinition {
  return {
    metadata: {
      id: theme.id,
      name: theme.name,
      description: theme.description,
      previewColors: theme.colors.previewColors,
      colorFamily: theme.metadata.colorFamily,
      brightness: theme.metadata.brightness,
    },
    semanticColors: theme.colors.semantic,
    config: defineConfig({
      theme: {
        tokens: {
          colors: {
            brand: Object.fromEntries(
              Object.entries(theme.colors.brand).map(([key, value]) => [key, { value }])
            ),
          },
          // Use CSS variable references so fonts can be changed dynamically
          fonts: {
            body: { value: 'var(--app-font-body)' },
            heading: { value: 'var(--app-font-heading)' },
            mono: { value: 'var(--app-font-mono)' },
          },
          // Use CSS variable references so font sizes can be changed dynamically
          fontSizes: {
            xs: { value: 'var(--app-font-size-xs)' },
            sm: { value: 'var(--app-font-size-sm)' },
            md: { value: 'var(--app-font-size-md)' },
            lg: { value: 'var(--app-font-size-lg)' },
            xl: { value: 'var(--app-font-size-xl)' },
            '2xl': { value: 'var(--app-font-size-2xl)' },
            '3xl': { value: 'var(--app-font-size-3xl)' },
            '4xl': { value: 'var(--app-font-size-4xl)' },
          },
          radii: theme.radii
            ? Object.fromEntries(
                Object.entries(theme.radii).map(([key, value]) => [key, { value }])
              )
            : undefined,
          shadows: theme.shadows
            ? Object.fromEntries(
                Object.entries(theme.shadows).map(([key, value]) => [key, { value }])
              )
            : undefined,
        },
      },
    }),
  };
}

/**
 * Theme registry - dynamically built from JSON themes
 */
export const THEME_REGISTRY: Record<string, ThemeDefinition> = {};

// Populate registry from loaded themes
const themeIds = getAllThemeIds();
for (const id of themeIds) {
  const resolved = resolveTheme(id);
  THEME_REGISTRY[id] = toThemeDefinition(resolved);
}

/**
 * Get theme definition by ID
 *
 * CONTRACT:
 *   Inputs:
 *     - themeId: string identifier for theme, nullable/undefined allowed
 *
 *   Outputs:
 *     - ThemeDefinition object for the requested theme
 *
 *   Invariants:
 *     - Always returns a valid theme (never undefined)
 *     - Invalid/null themeId returns 'obsidian' theme (default)
 *     - Return value contains complete Chakra config
 */
export function getTheme(themeId?: string | null): ThemeDefinition {
  if (themeId && loaderIsValidThemeId(themeId)) {
    return THEME_REGISTRY[themeId] || THEME_REGISTRY.obsidian;
  }
  // Log warning for invalid theme IDs (helps debugging)
  if (themeId) {
    console.warn(`Invalid theme ID "${themeId}", falling back to obsidian theme`);
  }
  return THEME_REGISTRY.obsidian;
}

/**
 * Get all available themes for UI display
 *
 * CONTRACT:
 *   Inputs:
 *     - none
 *
 *   Outputs:
 *     - Array of ThemeMetadata objects, one per theme in registry
 *
 *   Invariants:
 *     - Returns all themes in the registry
 *     - Order: light themes first, then dark themes alphabetically
 *     - Each metadata object includes preview colors for swatches
 */
export function getAllThemes(): ThemeMetadata[] {
  // Get all themes and sort: light themes first, then dark themes
  const allThemeIds = getAllThemeIds();

  // Separate light and dark themes
  const lightThemes: string[] = [];
  const darkThemes: string[] = [];

  for (const id of allThemeIds) {
    const theme = THEME_REGISTRY[id];
    if (theme?.metadata.brightness === 'light') {
      lightThemes.push(id);
    } else {
      darkThemes.push(id);
    }
  }

  // Sort each group alphabetically and combine
  lightThemes.sort();
  darkThemes.sort();

  return [...lightThemes, ...darkThemes]
    .filter((id) => THEME_REGISTRY[id])
    .map((id) => THEME_REGISTRY[id].metadata);
}

/**
 * Validate theme ID
 *
 * CONTRACT:
 *   Inputs:
 *     - themeId: string to validate, nullable/undefined allowed
 *
 *   Outputs:
 *     - boolean: true if themeId is valid and exists in registry
 *
 *   Invariants:
 *     - Returns true only for theme IDs present in THEME_REGISTRY
 *     - Returns false for null, undefined, empty string, or unknown IDs
 */
export function isValidThemeId(themeId?: string | null): themeId is ThemeId {
  if (!themeId || typeof themeId !== 'string') {
    return false;
  }
  return loaderIsValidThemeId(themeId);
}

/**
 * Get semantic colors for a theme
 */
export function getSemanticColors(themeId: string): ThemeSemanticColors {
  return loaderGetSemanticColors(themeId);
}

// Re-export types from schema
export type { ColorFamily, ThemeBrightness } from './schema';
