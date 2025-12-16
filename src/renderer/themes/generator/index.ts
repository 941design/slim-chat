/**
 * Theme Generator
 *
 * Main entry point for algorithmic theme generation.
 * Generates complete themes from minimal input parameters.
 */

import type { FontFamily, ResolvedTheme, ThemeId } from '../schema';
import { generateBrandRamp } from './ramp';
import { deriveSemanticTokens } from './semantic';
import { validateTheme, formatValidationResult } from './validator';
import type { GeneratedTheme, ThemeGeneratorInput, ValidationResult } from './types';

// Re-export types for convenience
export type { ThemeGeneratorInput, GeneratedTheme, ValidationResult } from './types';
export { WCAG, STATUS_HUES } from './types';

// Re-export utilities that may be useful externally
export { contrastRatio, relativeLuminance, hexToOklch, oklchToHex } from './oklch';
export { validateTheme, formatValidationResult, validateAllThemes } from './validator';

/**
 * Font family presets mapping to CSS font stacks.
 */
export const FONT_FAMILY_PRESETS: Record<FontFamily, { body: string; heading: string; mono: string }> = {
  system: {
    body: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    heading: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace",
  },
  inter: {
    body: "'Inter', system-ui, -apple-system, sans-serif",
    heading: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'SF Mono', 'Fira Code', Menlo, monospace",
  },
  roboto: {
    body: "'Roboto', system-ui, -apple-system, sans-serif",
    heading: "'Roboto', system-ui, -apple-system, sans-serif",
    mono: "'Roboto Mono', 'SF Mono', Menlo, monospace",
  },
  'source-sans': {
    body: "'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif",
    heading: "'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif",
    mono: "'Source Code Pro', 'SF Mono', Menlo, monospace",
  },
  'jetbrains-mono': {
    body: "'JetBrains Mono', 'Fira Code', monospace",
    heading: "'JetBrains Mono', 'Fira Code', monospace",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  'fira-code': {
    body: "'Fira Code', 'JetBrains Mono', monospace",
    heading: "'Fira Code', 'JetBrains Mono', monospace",
    mono: "'Fira Code', 'JetBrains Mono', monospace",
  },
};

/**
 * Default typography settings shared across all themes.
 */
const DEFAULT_TYPOGRAPHY = {
  fonts: FONT_FAMILY_PRESETS.system,
  fontSizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
  },
  fontWeights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeights: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
};

/**
 * Scale a rem value by a factor.
 */
function scaleRem(rem: string, factor: number): string {
  const value = parseFloat(rem);
  return `${(value * factor).toFixed(3)}rem`;
}

/**
 * Get typography settings for a font family and size factor.
 */
function getTypography(fontFamily?: FontFamily, fontSizeFactor?: number) {
  const fonts = fontFamily ? FONT_FAMILY_PRESETS[fontFamily] : DEFAULT_TYPOGRAPHY.fonts;
  const factor = fontSizeFactor ?? 1.0;

  // Scale font sizes if factor is not 1.0
  const fontSizes =
    factor === 1.0
      ? DEFAULT_TYPOGRAPHY.fontSizes
      : {
          xs: scaleRem(DEFAULT_TYPOGRAPHY.fontSizes.xs, factor),
          sm: scaleRem(DEFAULT_TYPOGRAPHY.fontSizes.sm, factor),
          md: scaleRem(DEFAULT_TYPOGRAPHY.fontSizes.md, factor),
          lg: scaleRem(DEFAULT_TYPOGRAPHY.fontSizes.lg, factor),
          xl: scaleRem(DEFAULT_TYPOGRAPHY.fontSizes.xl, factor),
          '2xl': scaleRem(DEFAULT_TYPOGRAPHY.fontSizes['2xl'], factor),
          '3xl': scaleRem(DEFAULT_TYPOGRAPHY.fontSizes['3xl'], factor),
          '4xl': scaleRem(DEFAULT_TYPOGRAPHY.fontSizes['4xl'], factor),
        };

  return {
    ...DEFAULT_TYPOGRAPHY,
    fonts,
    fontSizes,
  };
}

/**
 * Default border radius settings.
 */
const DEFAULT_RADII = {
  none: '0',
  sm: '0.125rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  full: '9999px',
};

/**
 * Default shadow settings.
 */
const DEFAULT_SHADOWS = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
};

/**
 * Theme Generator class.
 * Generates complete themes from minimal input parameters.
 */
export class ThemeGenerator {
  /**
   * Generate a complete theme from input parameters.
   *
   * @param input Theme generation parameters
   * @param strict If true, throws on validation failure (default: true)
   * @returns Generated theme with validation results
   */
  static generate(input: ThemeGeneratorInput, strict: boolean = true): GeneratedTheme {
    // 1. Generate brand color ramp
    const brand = generateBrandRamp(input);

    // 2. Derive all semantic tokens
    const semantic = deriveSemanticTokens(brand, input);

    // 3. Validate
    const validation = validateTheme(brand, semantic, input);

    if (strict && !validation.valid) {
      const errorMessages = validation.errors
        .map((e) => `  - [${e.type}] ${e.message} (${e.actual} vs ${e.required})`)
        .join('\n');
      throw new Error(`Theme "${input.id}" failed validation:\n${errorMessages}`);
    }

    // 4. Build preview colors
    const preview = {
      primary: brand[500],
      background: input.brightness === 'dark' ? brand[900] : brand[50],
      text: input.brightness === 'dark' ? brand[200] : brand[800],
    };

    return {
      id: input.id as ThemeId,
      name: input.name,
      description: input.description,
      brightness: input.brightness,
      colorFamily: input.colorFamily,
      fontFamily: input.fontFamily,
      fontSizeFactor: input.fontSizeFactor,
      brand,
      semantic,
      preview,
      validation,
    };
  }

  /**
   * Generate multiple themes.
   *
   * @param inputs Array of theme input configurations
   * @param strict If true, throws on any validation failure
   * @returns Map of theme ID to generated theme
   */
  static generateAll(
    inputs: ThemeGeneratorInput[],
    strict: boolean = true
  ): Map<string, GeneratedTheme> {
    const results = new Map<string, GeneratedTheme>();

    for (const input of inputs) {
      try {
        const theme = ThemeGenerator.generate(input, strict);
        results.set(input.id, theme);
      } catch (error) {
        if (strict) throw error;
        console.error(`Failed to generate theme "${input.id}":`, error);
      }
    }

    return results;
  }

  /**
   * Convert a generated theme to the ResolvedTheme format used by the app.
   */
  static toResolvedTheme(generated: GeneratedTheme): ResolvedTheme {
    return {
      id: generated.id,
      name: generated.name,
      description: generated.description,
      metadata: {
        colorFamily: generated.colorFamily,
        brightness: generated.brightness,
      },
      colors: {
        brand: generated.brand,
        semantic: generated.semantic,
        previewColors: generated.preview,
      },
      typography: getTypography(generated.fontFamily, generated.fontSizeFactor),
      radii: DEFAULT_RADII,
      shadows: DEFAULT_SHADOWS,
    };
  }

  /**
   * Generate themes and return as ResolvedTheme map.
   */
  static generateResolved(
    inputs: ThemeGeneratorInput[],
    strict: boolean = true
  ): Map<string, ResolvedTheme> {
    const generated = ThemeGenerator.generateAll(inputs, strict);
    const resolved = new Map<string, ResolvedTheme>();

    for (const [id, theme] of Array.from(generated.entries())) {
      resolved.set(id, ThemeGenerator.toResolvedTheme(theme));
    }

    return resolved;
  }

  /**
   * Validate inputs and report which themes would pass/fail.
   * Useful for auditing before generation.
   */
  static audit(inputs: ThemeGeneratorInput[]): {
    passed: string[];
    failed: Array<{ id: string; errors: string[] }>;
    warnings: Array<{ id: string; warnings: string[] }>;
  } {
    const passed: string[] = [];
    const failed: Array<{ id: string; errors: string[] }> = [];
    const warnings: Array<{ id: string; warnings: string[] }> = [];

    for (const input of inputs) {
      try {
        const theme = ThemeGenerator.generate(input, false);

        if (theme.validation.valid) {
          passed.push(input.id);
          if (theme.validation.warnings.length > 0) {
            warnings.push({
              id: input.id,
              warnings: theme.validation.warnings.map((w) => w.message),
            });
          }
        } else {
          failed.push({
            id: input.id,
            errors: theme.validation.errors.map((e) => e.message),
          });
        }
      } catch (error) {
        failed.push({
          id: input.id,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }

    return { passed, failed, warnings };
  }
}

/**
 * Convenience function to generate a single theme.
 */
export function generateTheme(input: ThemeGeneratorInput, strict?: boolean): GeneratedTheme {
  return ThemeGenerator.generate(input, strict);
}

/**
 * Convenience function to generate and resolve themes.
 */
export function generateResolvedThemes(
  inputs: ThemeGeneratorInput[],
  strict?: boolean
): Map<string, ResolvedTheme> {
  return ThemeGenerator.generateResolved(inputs, strict);
}
