/**
 * Theme Generator Types
 *
 * Defines the minimal input schema for algorithmic theme generation.
 * A theme is fully derived from these parameters using OKLCH color space.
 */

import type { ColorFamily, FontFamily, ThemeBrightness, ThemeId } from '../schema';

/**
 * Saturation range for the brand color palette.
 * Values are 0-1 where 0 is grayscale and 1 is fully saturated.
 */
export interface SaturationRange {
  /** Minimum saturation (used at lightness extremes) */
  min: number;
  /** Maximum saturation (used at mid-lightness) */
  max: number;
}

/**
 * Lightness range for the brand color palette.
 * Values are 0-1 where 0 is black and 1 is white.
 */
export interface LightnessRange {
  /** Darkest value in the palette (e.g., 0.08 for near-black) */
  min: number;
  /** Lightest value in the palette (e.g., 0.97 for near-white) */
  max: number;
}

/**
 * Minimal input for algorithmic theme generation.
 *
 * From these parameters, the generator produces:
 * - A complete brand color ramp (50-900)
 * - All 18 base semantic tokens
 * - All 13 derived semantic tokens
 * - Preview colors for the theme selector
 */
export interface ThemeGeneratorInput {
  /** Unique theme identifier */
  id: string;

  /** Display name for UI */
  name: string;

  /** Brief description */
  description: string;

  /**
   * Primary hue in degrees (0-360).
   * This is the dominant color of the theme.
   *
   * Common values:
   * - 0: Red
   * - 30: Orange
   * - 60: Yellow
   * - 120: Green
   * - 180: Cyan
   * - 210: Blue
   * - 270: Purple
   * - 330: Pink
   */
  baseHue: number;

  /**
   * Secondary hue offset in degrees (-180 to +180).
   * Added to baseHue for accent colors (e.g., links, focus states).
   *
   * Common patterns:
   * - 0: Monochromatic (same hue)
   * - 30: Analogous (adjacent on color wheel)
   * - 180: Complementary (opposite)
   * - 120/-120: Triadic
   */
  secondaryHueOffset: number;

  /**
   * Optional tertiary hue offset for additional accent.
   * If not provided, derived accents will use secondary.
   */
  tertiaryHueOffset?: number;

  /** Saturation range for the brand palette */
  saturation: SaturationRange;

  /** Lightness range for the brand palette */
  lightness: LightnessRange;

  /** Light or dark mode */
  brightness: ThemeBrightness;

  /**
   * Contrast strictness factor.
   * Multiplied against WCAG thresholds during validation.
   *
   * - 1.0: Standard AA compliance (4.5:1 for normal text)
   * - 1.1+: Stricter than AA
   * - 0.8-0.9: Relaxed (use with caution)
   */
  contrastFactor: number;

  /** Color family for UI filtering */
  colorFamily: ColorFamily;

  /** Font family for the theme */
  fontFamily?: FontFamily;

  /**
   * Font size scaling factor (0.5 to 1.5).
   * Multiplied against base font sizes.
   * Default is 1.0 (no scaling).
   */
  fontSizeFactor?: number;

  /**
   * Optional explicit overrides for specific tokens.
   * Use sparingly - only when derivation produces poor results.
   */
  overrides?: Partial<BaseSemanticTokens>;
}

/**
 * The 18 base semantic tokens that must be explicitly defined or derived.
 * These form the foundation from which all other tokens are computed.
 */
export interface BaseSemanticTokens {
  // Backgrounds (3)
  appBg: string;
  surfaceBg: string;
  menuBg: string;

  // Borders (1)
  border: string;

  // Text (2)
  text: string;
  textMuted: string;

  // Status (4)
  statusSuccess: string;
  statusWarning: string;
  statusError: string;
  statusInfo: string;

  // Buttons (3)
  buttonPrimaryBg: string;
  buttonSecondaryBg: string;
  buttonDangerBg: string;

  // Inputs (2)
  inputBg: string;
  inputBorder: string;

  // Links (1)
  link: string;

  // Bubbles (2)
  ownBubbleBg: string;
  ownBubbleText: string;
}

/**
 * The 13 derived semantic tokens computed from base tokens.
 * These are auto-generated but can be overridden if needed.
 */
export interface DerivedSemanticTokens {
  // Backgrounds (2)
  surfaceBgSubtle: string;
  surfaceBgSelected: string;

  // Borders (1)
  borderSubtle: string;

  // Text (1)
  textSubtle: string;

  // Buttons (6)
  buttonPrimaryText: string;
  buttonPrimaryHover: string;
  buttonSecondaryText: string;
  buttonSecondaryHover: string;
  buttonDangerText: string;
  buttonDangerHover: string;

  // Inputs (1)
  inputFocus: string;

  // Links (1)
  linkHover: string;

  // Bubbles (1)
  ownBubbleBorder: string;
}

/**
 * Complete semantic tokens = Base + Derived.
 * This matches the full SemanticColors interface in schema.ts.
 */
export type AllSemanticTokens = BaseSemanticTokens & DerivedSemanticTokens;

/**
 * Result of theme generation including validation status.
 */
export interface GeneratedTheme {
  /** The resolved theme ready for use */
  id: ThemeId;
  name: string;
  description: string;
  brightness: ThemeBrightness;
  colorFamily: ColorFamily;
  fontFamily?: FontFamily;
  fontSizeFactor?: number;

  /** Brand color palette (50-900) */
  brand: BrandRamp;

  /** All semantic tokens (base + derived) */
  semantic: AllSemanticTokens;

  /** Preview colors for theme selector */
  preview: {
    primary: string;
    background: string;
    text: string;
  };

  /** Validation results */
  validation: ValidationResult;
}

/**
 * Brand color ramp following Chakra UI convention.
 */
export interface BrandRamp {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}

/**
 * Validation result from theme generation.
 */
export interface ValidationResult {
  /** True if all contrast checks pass */
  valid: boolean;

  /** Errors that must be fixed */
  errors: ValidationError[];

  /** Warnings that should be reviewed */
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'contrast' | 'hue_drift' | 'lightness_monotonic';
  message: string;
  tokens: string[];
  actual: number;
  required: number;
}

export interface ValidationWarning {
  type: 'near_threshold' | 'gamut_clipped';
  message: string;
  tokens: string[];
  actual: number;
  threshold: number;
}

/**
 * Fixed hue values for status colors.
 * These are constant across all themes to maintain semantic meaning.
 */
export const STATUS_HUES = {
  success: 145, // Green
  warning: 45, // Orange/Amber
  error: 25, // Red
  info: 210, // Blue (uses brand hue if similar)
} as const;

/**
 * WCAG contrast thresholds.
 */
export const WCAG = {
  AA_NORMAL: 4.5,
  AA_LARGE: 3.0,
  AAA_NORMAL: 7.0,
  AAA_LARGE: 4.5,
} as const;
