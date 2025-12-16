/**
 * OKLCH Color Space Utilities
 *
 * OKLCH is a perceptually uniform color space where equal changes in L (lightness)
 * appear equal to human vision. This makes it ideal for generating accessible
 * color ramps and deriving related colors.
 *
 * Color model:
 * - L: Lightness (0-1, where 0 is black, 1 is white)
 * - C: Chroma (0-0.4 typical, saturation intensity)
 * - H: Hue (0-360 degrees)
 */

export interface OklchColor {
  /** Lightness (0-1) */
  L: number;
  /** Chroma (0-0.4 typical) */
  C: number;
  /** Hue (0-360 degrees) */
  H: number;
  /** Alpha (0-1, optional) */
  A?: number;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Convert OKLCH to hex string.
 *
 * Algorithm: OKLCH → OKLab → Linear sRGB → sRGB → Hex
 */
export function oklchToHex(color: OklchColor): string {
  const { L, C, H, A } = color;

  // OKLCH to OKLab
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab to Linear sRGB via LMS
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // Linear sRGB
  let lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  // Gamut mapping: clamp to sRGB
  lr = Math.max(0, Math.min(1, lr));
  lg = Math.max(0, Math.min(1, lg));
  lb = Math.max(0, Math.min(1, lb));

  // Linear sRGB to sRGB (gamma correction)
  const toSrgb = (x: number): number =>
    x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;

  const r = Math.round(toSrgb(lr) * 255);
  const g = Math.round(toSrgb(lg) * 255);
  const bVal = Math.round(toSrgb(lb) * 255);

  const toHex = (n: number): string => n.toString(16).padStart(2, '0');

  if (A !== undefined && A < 1) {
    const alpha = Math.round(A * 255);
    return `#${toHex(r)}${toHex(g)}${toHex(bVal)}${toHex(alpha)}`;
  }

  return `#${toHex(r)}${toHex(g)}${toHex(bVal)}`;
}

/**
 * Parse hex string to RGB values.
 */
export function hexToRgb(hex: string): RgbColor {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return { r, g, b };
}

/**
 * Convert hex string to OKLCH.
 *
 * Algorithm: Hex → sRGB → Linear sRGB → OKLab → OKLCH
 */
export function hexToOklch(hex: string): OklchColor {
  const rgb = hexToRgb(hex);

  // sRGB to Linear sRGB
  const toLinear = (c: number): number => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };

  const lr = toLinear(rgb.r);
  const lg = toLinear(rgb.g);
  const lb = toLinear(rgb.b);

  // Linear sRGB to LMS
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  // LMS to OKLab
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  // OKLab to OKLCH
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;

  return { L, C, H };
}

/**
 * Calculate relative luminance per WCAG 2.1 specification.
 * Used for contrast ratio calculations.
 */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);

  const toLinear = (c: number): number => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

/**
 * Calculate WCAG 2.1 contrast ratio between two colors.
 *
 * @returns Contrast ratio (1:1 to 21:1)
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const lum1 = relativeLuminance(hex1);
  const lum2 = relativeLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Adjust lightness of an OKLCH color.
 */
export function adjustLightness(color: OklchColor, delta: number): OklchColor {
  return {
    ...color,
    L: Math.max(0, Math.min(1, color.L + delta)),
  };
}

/**
 * Adjust chroma of an OKLCH color.
 */
export function adjustChroma(color: OklchColor, delta: number): OklchColor {
  return {
    ...color,
    C: Math.max(0, color.C + delta),
  };
}

/**
 * Shift hue of an OKLCH color.
 */
export function shiftHue(color: OklchColor, degrees: number): OklchColor {
  let newH = color.H + degrees;
  while (newH < 0) newH += 360;
  while (newH >= 360) newH -= 360;
  return {
    ...color,
    H: newH,
  };
}

/**
 * Mix two colors in OKLCH space.
 *
 * @param color1 First color
 * @param color2 Second color
 * @param ratio Blend ratio (0 = color1, 1 = color2)
 */
export function mixOklch(color1: OklchColor, color2: OklchColor, ratio: number): OklchColor {
  const r = Math.max(0, Math.min(1, ratio));
  return {
    L: color1.L + (color2.L - color1.L) * r,
    C: color1.C + (color2.C - color1.C) * r,
    H: interpolateHue(color1.H, color2.H, r),
  };
}

/**
 * Interpolate between two hue values, taking the shorter path.
 */
function interpolateHue(h1: number, h2: number, ratio: number): number {
  let diff = h2 - h1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  let result = h1 + diff * ratio;
  while (result < 0) result += 360;
  while (result >= 360) result -= 360;
  return result;
}

/**
 * Determine if a color is considered "dark" (for auto-contrast text).
 * Uses the WCAG relative luminance threshold.
 */
export function isDark(hex: string): boolean {
  return relativeLuminance(hex) < 0.179;
}

/**
 * Get an auto-contrast text color for a given background.
 * Chooses between white and dark text based on which provides better contrast.
 * Guarantees WCAG AA (4.5:1) contrast when possible.
 */
export function autoContrastText(bgHex: string): string {
  const white = '#ffffff';
  const dark = '#1a1a1a'; // Very dark, almost black

  const whiteContrast = contrastRatio(white, bgHex);
  const darkContrast = contrastRatio(dark, bgHex);

  // Choose the color with better contrast
  return whiteContrast > darkContrast ? white : dark;
}

/**
 * Parse rgba string to components.
 */
export function parseRgba(rgba: string): { r: number; g: number; b: number; a: number } | null {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return null;
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: match[4] ? parseFloat(match[4]) : 1,
  };
}

/**
 * Check if a color string has alpha transparency.
 */
export function hasAlpha(color: string): boolean {
  if (color.startsWith('rgba')) return true;
  if (color.startsWith('#') && color.length === 9) return true;
  return false;
}

/**
 * Composite an rgba color over a solid background.
 * Returns the resulting solid hex color.
 */
export function compositeOver(fgRgba: string, bgHex: string): string {
  const fg = parseRgba(fgRgba);
  if (!fg) return bgHex;

  const bg = hexToRgb(bgHex);
  const a = fg.a;

  const r = Math.round(fg.r * a + bg.r * (1 - a));
  const g = Math.round(fg.g * a + bg.g * (1 - a));
  const b = Math.round(fg.b * a + bg.b * (1 - a));

  const toHex = (n: number): string =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
