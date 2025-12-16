/**
 * Theme Loader
 *
 * Generates themes from presets using the algorithmic theme generator.
 * Themes are generated at module load time with WCAG validation.
 */

import type { ThemeId, ResolvedTheme, BrandColors, SemanticColors } from './schema';
import { ThemeGenerator } from './generator';
import { THEME_PRESETS } from './presets';

// Generate all themes at module load time
// This ensures themes are validated before the app starts
const generatedThemes: Map<string, ResolvedTheme> = new Map();

/**
 * Initialize generated themes from presets.
 * Runs automatically on module load.
 */
function initializeThemes(): void {
  if (generatedThemes.size > 0) return;

  // Generate with strict=false to allow themes with warnings
  // Validation errors are logged but don't prevent generation
  const generated = ThemeGenerator.generateAll(THEME_PRESETS, false);

  for (const [id, theme] of Array.from(generated.entries())) {
    const resolved = ThemeGenerator.toResolvedTheme(theme);
    generatedThemes.set(id, resolved);

    // Log validation warnings/errors in development
    if (process.env.NODE_ENV === 'development') {
      if (!theme.validation.valid) {
        console.warn(`Theme "${id}" has validation errors:`, theme.validation.errors);
      } else if (theme.validation.warnings.length > 0) {
        console.info(`Theme "${id}" has warnings:`, theme.validation.warnings);
      }
    }
  }
}

// Initialize on module load
initializeThemes();

/**
 * Resolve a theme by ID.
 * Returns the generated theme or falls back to 'obsidian' if not found.
 */
export function resolveTheme(themeId: string): ResolvedTheme {
  initializeThemes();

  if (generatedThemes.has(themeId)) {
    return generatedThemes.get(themeId)!;
  }

  console.warn(`Theme "${themeId}" not found, falling back to obsidian`);
  return generatedThemes.get('obsidian')!;
}

/**
 * Get all available theme IDs (excluding 'default').
 */
export function getAllThemeIds(): ThemeId[] {
  initializeThemes();
  return Array.from(generatedThemes.keys()) as ThemeId[];
}

/**
 * Get all resolved themes.
 */
export function getAllThemes(): ResolvedTheme[] {
  initializeThemes();
  return Array.from(generatedThemes.values());
}

/**
 * Check if a theme ID is valid.
 */
export function isValidThemeId(id: string): id is ThemeId {
  initializeThemes();
  return generatedThemes.has(id);
}

/**
 * Get semantic colors for a theme.
 */
export function getSemanticColors(themeId: string): SemanticColors {
  const theme = resolveTheme(themeId);
  return theme.colors.semantic;
}

/**
 * Get brand colors for a theme.
 */
export function getBrandColors(themeId: string): BrandColors {
  const theme = resolveTheme(themeId);
  return theme.colors.brand;
}

/**
 * Get theme metadata.
 */
export function getThemeMetadata(
  themeId: string
): ResolvedTheme['metadata'] & {
  name: string;
  description: string;
  previewColors: ResolvedTheme['colors']['previewColors'];
} {
  const theme = resolveTheme(themeId);
  return {
    ...theme.metadata,
    name: theme.name,
    description: theme.description,
    previewColors: theme.colors.previewColors,
  };
}

/**
 * Force regeneration of themes (useful for development/testing).
 */
export function regenerateThemes(): void {
  generatedThemes.clear();
  initializeThemes();
}
