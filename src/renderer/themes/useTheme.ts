/**
 * Theme System Hook
 *
 * Provides theme application logic and Chakra system integration.
 * Returns current theme based on active identity's theme preference.
 */

import { createSystem, defaultConfig } from '@chakra-ui/react';
import { getTheme, type ThemeId, type ThemeSemanticColors } from './definitions';
import { NostlingIdentity } from '../../shared/types';

export type { ThemeSemanticColors };

/**
 * Create Chakra UI system with theme applied
 *
 * CONTRACT:
 *   Inputs:
 *     - themeId: theme identifier string, nullable/undefined allowed
 *
 *   Outputs:
 *     - Chakra system object configured with the specified theme
 *
 *   Invariants:
 *     - Always returns valid Chakra system (never undefined)
 *     - System includes both defaultConfig and theme-specific config
 *     - Invalid themeId results in 'dark' theme system (fallback)
 *
 *   Properties:
 *     - Consistent: same themeId produces equivalent system
 *     - Complete: returned system works with all Chakra UI components
 *     - Fallback: createThemeSystem(null) equals createThemeSystem('dark')
 *
 *   Algorithm:
 *     1. Resolve themeId to ThemeDefinition via getTheme() (handles fallback)
 *     2. Extract Chakra config from definition
 *     3. Merge defaultConfig with theme config
 *     4. Return createSystem() result
 */
export function createThemeSystem(themeId?: string | null): ReturnType<typeof createSystem> {
  const themeDef = getTheme(themeId);
  return createSystem(defaultConfig, themeDef.config);
}

/**
 * Get theme ID for identity
 *
 * CONTRACT:
 *   Inputs:
 *     - identity: NostlingIdentity object or null (no active identity)
 *
 *   Outputs:
 *     - ThemeId string representing the theme to use
 *
 *   Invariants:
 *     - Always returns valid ThemeId (never null/undefined)
 *     - Null identity returns 'obsidian' (default)
 *     - Identity without theme field returns 'obsidian' (default)
 *     - Identity with invalid theme returns 'obsidian' (fallback)
 *     - Identity with valid theme returns that theme ID
 *
 *   Properties:
 *     - Default: getThemeIdForIdentity(null) equals 'obsidian'
 *     - Validation: output is always valid ThemeId per isValidThemeId()
 *     - Idempotent: multiple calls with same identity return same ID
 *
 *   Algorithm:
 *     1. If identity is null → return 'obsidian'
 *     2. If identity.theme is undefined/null → return 'obsidian'
 *     3. If identity.theme is invalid per isValidThemeId() → return 'obsidian'
 *     4. Otherwise → return identity.theme
 */
export function getThemeIdForIdentity(identity: NostlingIdentity | null): ThemeId {
  if (!identity || !identity.theme) {
    return 'obsidian';
  }
  // Delegate validation to getTheme which handles fallback
  const theme = getTheme(identity.theme);
  return theme.metadata.id;
}

/**
 * Get semantic colors for theme
 *
 * CONTRACT:
 *   Inputs:
 *     - themeId: theme identifier string, nullable/undefined allowed
 *
 *   Outputs:
 *     - ThemeSemanticColors object with all semantic color tokens
 *
 *   Invariants:
 *     - Always returns valid semantic colors (never undefined)
 *     - Invalid themeId results in 'dark' theme colors (fallback)
 *
 *   Properties:
 *     - Consistent: same themeId produces same colors
 *     - Complete: returned object contains all semantic color properties
 *     - Fallback: getSemanticColors(null) equals getSemanticColors('dark')
 */
export function getSemanticColors(themeId?: string | null): ThemeSemanticColors {
  const themeDef = getTheme(themeId);
  return themeDef.semanticColors;
}
