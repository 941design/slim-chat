/**
 * Semantic Token Derivation
 *
 * Derives all 31 semantic tokens from the brand ramp and input parameters.
 * - 18 base tokens: Mapped from brand ramp based on brightness mode
 * - 13 derived tokens: Computed from base tokens using derivation rules
 */

import {
  adjustLightness,
  autoContrastText,
  compositeOver,
  contrastRatio,
  hasAlpha,
  hexToOklch,
  oklchToHex,
  parseRgba,
} from './oklch';
import type {
  AllSemanticTokens,
  BaseSemanticTokens,
  BrandRamp,
  DerivedSemanticTokens,
  ThemeGeneratorInput,
} from './types';
import { STATUS_HUES, WCAG } from './types';

/**
 * Derive all semantic tokens from the brand ramp.
 *
 * @param ramp Generated brand color ramp
 * @param input Theme generation parameters
 * @returns Complete semantic token set (base + derived)
 */
export function deriveSemanticTokens(
  ramp: BrandRamp,
  input: ThemeGeneratorInput
): AllSemanticTokens {
  const base = deriveBaseTokens(ramp, input);
  const derived = deriveDerivedTokens(base, ramp, input);

  // Apply any explicit overrides from input
  const overrides = input.overrides ?? {};
  const finalBase = { ...base, ...overrides };

  return { ...finalBase, ...derived };
}

/**
 * Derive the 18 base semantic tokens from the brand ramp.
 */
function deriveBaseTokens(ramp: BrandRamp, input: ThemeGeneratorInput): BaseSemanticTokens {
  const { brightness, baseHue, secondaryHueOffset } = input;
  const isDark = brightness === 'dark';

  // Secondary hue for accent colors
  const accentHue = normalizeHue(baseHue + secondaryHueOffset);

  // Generate button colors with guaranteed contrast
  // Adjust lightness based on hue - blues (200-260°) appear darker perceptually
  // and bright greens (120-160°) with high saturation can also have contrast issues
  const hueAdjustedLightness = getHueAdjustedLightness(accentHue, isDark);
  const primaryButtonBg = generateButtonColor(accentHue, hueAdjustedLightness, 0.20);

  // Status colors with proper contrast
  const statusColors = generateStatusColors(brightness);

  // Danger button - use a darker red that works with white text
  const dangerButtonBg = isDark
    ? oklchToHex({ L: 0.52, C: 0.22, H: STATUS_HUES.error })
    : oklchToHex({ L: 0.42, C: 0.22, H: STATUS_HUES.error });

  if (isDark) {
    return {
      // Backgrounds
      appBg: ramp[900],
      surfaceBg: 'rgba(0, 0, 0, 0.3)',
      menuBg: ramp[800],

      // Borders
      border: 'rgba(255, 255, 255, 0.1)',

      // Text
      text: ramp[200],
      textMuted: ramp[300], // Lighter for better contrast

      // Status
      ...statusColors,

      // Buttons
      buttonPrimaryBg: primaryButtonBg,
      buttonSecondaryBg: 'rgba(255, 255, 255, 0.1)',
      buttonDangerBg: dangerButtonBg,

      // Inputs
      inputBg: 'rgba(0, 0, 0, 0.2)',
      inputBorder: 'rgba(255, 255, 255, 0.1)',

      // Links - use a lighter brand color for visibility
      link: ramp[300],

      // Own message bubble
      ownBubbleBg: ramp[800],
      ownBubbleText: ramp[100],
    };
  } else {
    // Light mode
    return {
      // Backgrounds
      appBg: ramp[50],
      surfaceBg: '#ffffff',
      menuBg: '#ffffff',

      // Borders
      border: ramp[200],

      // Text
      text: ramp[900], // Darker for better contrast
      textMuted: ramp[700], // Darker for better contrast

      // Status
      ...statusColors,

      // Buttons
      buttonPrimaryBg: primaryButtonBg,
      buttonSecondaryBg: ramp[100],
      buttonDangerBg: dangerButtonBg,

      // Inputs
      inputBg: '#ffffff',
      inputBorder: ramp[200],

      // Links
      link: ramp[700], // Darker for better contrast

      // Own message bubble
      ownBubbleBg: ramp[800],
      ownBubbleText: '#ffffff',
    };
  }
}

/**
 * Derive the 13 derived semantic tokens from base tokens.
 */
function deriveDerivedTokens(
  base: BaseSemanticTokens,
  ramp: BrandRamp,
  input: ThemeGeneratorInput
): DerivedSemanticTokens {
  const isDark = input.brightness === 'dark';

  // Resolve button backgrounds to solid colors for contrast calculation
  const solidAppBg = resolveColor(base.appBg, '#0f172a');
  const solidPrimaryBg = resolveColor(base.buttonPrimaryBg, solidAppBg);
  const solidDangerBg = resolveColor(base.buttonDangerBg, solidAppBg);

  // Get the text colors first (they're based on the original button backgrounds)
  const primaryTextColor = autoContrastText(solidPrimaryBg);
  const dangerTextColor = autoContrastText(solidDangerBg);

  // Calculate hover colors that maintain contrast with the text colors
  const primaryHover = deriveHoverWithTextContrast(solidPrimaryBg, primaryTextColor, isDark);
  const dangerHover = deriveHoverWithTextContrast(solidDangerBg, dangerTextColor, isDark);

  return {
    // Backgrounds
    surfaceBgSubtle: deriveSurfaceBgSubtle(base.surfaceBg, base.appBg, isDark),
    surfaceBgSelected: deriveSurfaceBgSelected(base.surfaceBg, isDark),

    // Borders
    borderSubtle: deriveBorderSubtle(base.border, isDark),

    // Text - use a lighter color for dark themes, darker for light themes
    textSubtle: isDark ? ramp[400] : ramp[600],

    // Button text - auto-contrast based on background
    buttonPrimaryText: autoContrastText(solidPrimaryBg),
    buttonSecondaryText: base.text,
    buttonDangerText: autoContrastText(solidDangerBg),

    // Button hover
    buttonPrimaryHover: primaryHover,
    buttonSecondaryHover: deriveSurfaceBgSelected(base.buttonSecondaryBg, isDark),
    buttonDangerHover: dangerHover,

    // Input focus - use status info color
    inputFocus: base.statusInfo,

    // Link hover
    linkHover: deriveLinkHover(resolveColor(base.link, solidAppBg), isDark),

    // Bubble border - slightly lighter than background
    ownBubbleBorder: deriveBubbleBorder(base.ownBubbleBg, isDark),
  };
}

/**
 * Generate status colors with proper contrast.
 */
function generateStatusColors(
  brightness: 'light' | 'dark'
): Pick<BaseSemanticTokens, 'statusSuccess' | 'statusWarning' | 'statusError' | 'statusInfo'> {
  const isDark = brightness === 'dark';

  // Status colors need to be visible on both app and surface backgrounds
  // For dark themes: use brighter, more saturated colors
  // For light themes: use darker, more saturated colors
  return {
    statusSuccess: oklchToHex({
      L: isDark ? 0.7 : 0.45,
      C: isDark ? 0.2 : 0.18,
      H: STATUS_HUES.success,
    }),
    statusWarning: oklchToHex({
      L: isDark ? 0.75 : 0.55,
      C: 0.2,
      H: STATUS_HUES.warning,
    }),
    statusError: oklchToHex({
      L: isDark ? 0.65 : 0.5,
      C: 0.22,
      H: STATUS_HUES.error,
    }),
    statusInfo: oklchToHex({
      L: isDark ? 0.65 : 0.5,
      C: 0.18,
      H: STATUS_HUES.info,
    }),
  };
}

/**
 * Get hue-adjusted lightness for button backgrounds.
 * Some hues appear perceptually darker and need boosted lightness for proper contrast.
 */
function getHueAdjustedLightness(hue: number, isDark: boolean): number {
  const normalizedHue = ((hue % 360) + 360) % 360;

  // Base lightness values
  const baseLightness = isDark ? 0.55 : 0.45;

  // Cyans and blues (180-270°) appear perceptually darker - boost lightness
  if (normalizedHue >= 180 && normalizedHue <= 270) {
    return isDark ? 0.62 : 0.40;
  }

  // Greens (120-180°) with high saturation can also have issues
  if (normalizedHue >= 120 && normalizedHue < 180) {
    return isDark ? 0.58 : 0.42;
  }

  return baseLightness;
}

/**
 * Generate a button color that will have good contrast with text.
 */
function generateButtonColor(hue: number, lightness: number, chroma: number): string {
  return oklchToHex({ L: lightness, C: chroma, H: hue });
}

/**
 * Normalize hue to 0-360 range.
 */
function normalizeHue(hue: number): number {
  let h = hue % 360;
  if (h < 0) h += 360;
  return h;
}

/**
 * Resolve a color to solid hex (composite if rgba).
 */
function resolveColor(color: string, bgHex: string): string {
  if (hasAlpha(color)) {
    return compositeOver(color, bgHex);
  }
  return color;
}

/**
 * Derive a hover color that maintains contrast with a specific text color.
 * This ensures the button text remains readable on both normal and hover states.
 */
function deriveHoverWithTextContrast(
  baseColor: string,
  textColor: string,
  isDark: boolean
): string {
  const oklch = hexToOklch(baseColor);
  const isWhiteText = textColor === '#ffffff';

  // For white text: hover should be darker (lower L)
  // For dark text: hover should be lighter (higher L)
  // This ensures we maintain or improve contrast
  let delta: number;
  if (isWhiteText) {
    // White text needs darker background for more contrast
    delta = -0.06;
  } else {
    // Dark text needs lighter background for more contrast
    delta = 0.06;
  }

  let newL = oklch.L + delta;

  // Ensure the hover color maintains at least AA contrast with the text
  let attempts = 0;
  while (attempts < 5) {
    const hoverColor = oklchToHex({ ...oklch, L: Math.max(0.15, Math.min(0.85, newL)) });
    const ratio = contrastRatio(textColor, hoverColor);

    if (ratio >= WCAG.AA_NORMAL) {
      return hoverColor;
    }

    // Adjust further in the same direction
    if (isWhiteText) {
      newL -= 0.05;
    } else {
      newL += 0.05;
    }
    attempts++;
  }

  // Fallback: return a safe hover color
  return oklchToHex({ ...oklch, L: isWhiteText ? 0.35 : 0.65 });
}

/**
 * Derive a simple hover color for links (doesn't need text contrast check).
 */
function deriveLinkHover(baseColor: string, isDark: boolean): string {
  const oklch = hexToOklch(baseColor);
  const delta = isDark ? 0.1 : -0.1;
  return oklchToHex({ ...oklch, L: Math.max(0.2, Math.min(0.8, oklch.L + delta)) });
}

/**
 * Derive surfaceBgSubtle by mixing surface with app background.
 */
function deriveSurfaceBgSubtle(surfaceBg: string, appBg: string, isDark: boolean): string {
  if (isDark) {
    return 'rgba(255, 255, 255, 0.05)';
  } else {
    const appOklch = hexToOklch(appBg);
    return oklchToHex({ ...appOklch, L: Math.min(0.98, appOklch.L + 0.02) });
  }
}

/**
 * Derive surfaceBgSelected by adjusting lightness.
 */
function deriveSurfaceBgSelected(surfaceBg: string, isDark: boolean): string {
  if (hasAlpha(surfaceBg)) {
    const parsed = parseRgba(surfaceBg);
    if (parsed) {
      const newAlpha = Math.min(1, parsed.a * 2);
      return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${newAlpha})`;
    }
  }

  const oklch = hexToOklch(surfaceBg);
  const delta = isDark ? 0.08 : -0.06;
  return oklchToHex(adjustLightness(oklch, delta));
}

/**
 * Derive borderSubtle by increasing visibility.
 */
function deriveBorderSubtle(border: string, isDark: boolean): string {
  if (hasAlpha(border)) {
    const parsed = parseRgba(border);
    if (parsed) {
      const newAlpha = Math.min(1, parsed.a * 2);
      return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${newAlpha})`;
    }
  }

  const oklch = hexToOklch(border);
  const delta = isDark ? 0.1 : -0.1;
  return oklchToHex(adjustLightness(oklch, delta));
}

/**
 * Derive bubble border from bubble background.
 */
function deriveBubbleBorder(bubbleBg: string, isDark: boolean): string {
  const oklch = hexToOklch(bubbleBg);
  const delta = isDark ? 0.1 : -0.1;
  return oklchToHex(adjustLightness(oklch, delta));
}
