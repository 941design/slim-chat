/**
 * Theme Context
 *
 * Provides semantic colors to all components in the app.
 * Components can use the useThemeColors() hook to access current theme colors.
 */

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { getSemanticColors, type ThemeSemanticColors } from './useTheme';
import type { ThemeId } from './definitions';
import { resolveTheme } from './loader';

/**
 * Theme context value
 */
interface ThemeContextValue {
  themeId: ThemeId;
  colors: ThemeSemanticColors;
}

/**
 * Default context value (obsidian theme)
 */
const defaultColors = getSemanticColors('obsidian');
const ThemeContext = createContext<ThemeContextValue>({
  themeId: 'obsidian',
  colors: defaultColors,
});

/**
 * Theme provider props
 */
interface ThemeProviderProps {
  themeId: ThemeId;
  children: React.ReactNode;
}

/**
 * Theme Provider Component
 *
 * Wraps the app to provide theme colors to all child components.
 * Updates when themeId changes to reflect new theme selection.
 *
 * CONTRACT:
 *   Inputs:
 *     - themeId: Current theme identifier
 *     - children: Child components to wrap
 *
 *   Outputs:
 *     - Context provider with current theme colors
 *
 *   Invariants:
 *     - Colors always correspond to the provided themeId
 *     - Invalid themeId falls back to 'obsidian' colors
 */
export function ThemeProvider({ themeId, children }: ThemeProviderProps): React.ReactElement {
  const contextValue = useMemo(
    () => ({
      themeId,
      colors: getSemanticColors(themeId),
    }),
    [themeId]
  );

  // Inject theme CSS variables directly onto :root
  // This bypasses Chakra's static token system for dynamic theme switching
  // We use --app-* prefix so Chakra's system can reference these variables
  useEffect(() => {
    const theme = resolveTheme(themeId);
    const root = document.documentElement;

    // Inject font sizes (used by Chakra's fontSizes tokens via var(--app-font-size-*))
    if (theme.typography?.fontSizes) {
      for (const [key, value] of Object.entries(theme.typography.fontSizes)) {
        root.style.setProperty(`--app-font-size-${key}`, value);
      }
    }

    // Inject radii
    if (theme.radii) {
      for (const [key, value] of Object.entries(theme.radii)) {
        root.style.setProperty(`--chakra-radii-${key}`, value);
      }
    }

    // Inject fonts (used by Chakra's fonts tokens via var(--app-font-*))
    if (theme.typography?.fonts) {
      for (const [key, value] of Object.entries(theme.typography.fonts)) {
        root.style.setProperty(`--app-font-${key}`, value);
      }
    }
  }, [themeId]);

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

/**
 * Custom Color Provider props
 */
interface ColorProviderProps {
  colors: ThemeSemanticColors;
  children: React.ReactNode;
}

/**
 * Custom Color Provider Component
 *
 * Provides custom colors directly to child components.
 * Used for previewing dynamically generated themes that aren't in the registry.
 *
 * CONTRACT:
 *   Inputs:
 *     - colors: ThemeSemanticColors object with all color tokens
 *     - children: Child components to wrap
 *
 *   Outputs:
 *     - Context provider with provided colors
 *
 *   Invariants:
 *     - Colors are passed through directly without lookup
 */
export function ColorProvider({ colors, children }: ColorProviderProps): React.ReactElement {
  const contextValue = useMemo(
    () => ({
      themeId: 'custom' as ThemeId,
      colors,
    }),
    [colors]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

/**
 * Hook to access current theme colors
 *
 * CONTRACT:
 *   Inputs:
 *     - none
 *
 *   Outputs:
 *     - ThemeSemanticColors object with all semantic color tokens
 *
 *   Invariants:
 *     - Returns colors from the nearest ThemeProvider
 *     - Falls back to obsidian theme if no provider exists
 *
 *   Usage:
 *     const colors = useThemeColors();
 *     <Box bg={colors.appBg} color={colors.text}>...</Box>
 */
export function useThemeColors(): ThemeSemanticColors {
  const context = useContext(ThemeContext);
  return context.colors;
}

/**
 * Hook to access full theme context (includes themeId)
 *
 * CONTRACT:
 *   Inputs:
 *     - none
 *
 *   Outputs:
 *     - ThemeContextValue with themeId and colors
 *
 *   Invariants:
 *     - Returns context from the nearest ThemeProvider
 *     - Falls back to obsidian theme if no provider exists
 */
export function useThemeContext(): ThemeContextValue {
  return useContext(ThemeContext);
}
