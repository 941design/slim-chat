/**
 * Theme Presets
 *
 * Each preset defines the minimal parameters needed for algorithmic generation.
 * These have been tuned to ensure WCAG AA compliance.
 *
 * Naming follows color associations:
 * - Geographic: ocean, arctic, forest, desert
 * - Natural: ember, sunset, twilight, dawn
 * - Materials: copper, jade, sapphire, obsidian
 * - Abstract: neon, void, haze, mist
 */

import type { ThemeGeneratorInput } from '../generator/types';

/**
 * All theme presets, carefully tuned for accessibility.
 */
export const THEME_PRESETS: ThemeGeneratorInput[] = [
  // ============================================
  // LIGHT THEMES (5)
  // ============================================

  {
    id: 'mist',
    name: 'Mist',
    description: 'Soft neutral light theme',
    baseHue: 210,
    secondaryHueOffset: 0,
    saturation: { min: 0.05, max: 0.15 },
    lightness: { min: 0.2, max: 0.98 },
    brightness: 'light',
    contrastFactor: 1.0,
    colorFamily: 'neutral',
  },

  {
    id: 'dawn',
    name: 'Dawn',
    description: 'Warm peachy morning light',
    baseHue: 25,
    secondaryHueOffset: 15,
    saturation: { min: 0.08, max: 0.35 },
    lightness: { min: 0.2, max: 0.98 },
    brightness: 'light',
    contrastFactor: 1.0,
    colorFamily: 'warm',
  },

  {
    id: 'cloud',
    name: 'Cloud',
    description: 'Clean blue-gray light theme',
    baseHue: 220,
    secondaryHueOffset: -10,
    saturation: { min: 0.05, max: 0.25 },
    lightness: { min: 0.15, max: 0.99 },
    brightness: 'light',
    contrastFactor: 1.0,
    colorFamily: 'blues',
  },

  {
    id: 'blossom',
    name: 'Blossom',
    description: 'Gentle pink spring theme',
    baseHue: 340,
    secondaryHueOffset: 20,
    saturation: { min: 0.08, max: 0.35 },
    lightness: { min: 0.2, max: 0.98 },
    brightness: 'light',
    contrastFactor: 1.0,
    colorFamily: 'pink',
  },

  {
    id: 'meadow',
    name: 'Meadow',
    description: 'Fresh green field theme',
    baseHue: 130,
    secondaryHueOffset: 15,
    saturation: { min: 0.08, max: 0.3 },
    lightness: { min: 0.18, max: 0.98 },
    brightness: 'light',
    contrastFactor: 1.0,
    colorFamily: 'greens',
  },

  // ============================================
  // DARK THEMES - Blues & Cyans (5)
  // ============================================

  {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Deep neutral dark theme',
    baseHue: 220,
    secondaryHueOffset: 0,
    saturation: { min: 0.05, max: 0.2 },
    lightness: { min: 0.06, max: 0.95 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'neutral',
  },

  {
    id: 'sapphire',
    name: 'Sapphire',
    description: 'Rich blue dark theme',
    baseHue: 225,
    secondaryHueOffset: 15,
    saturation: { min: 0.15, max: 0.5 },
    lightness: { min: 0.08, max: 0.95 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'blues',
  },

  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Cool cyan aquatic theme',
    baseHue: 195,
    secondaryHueOffset: -10,
    saturation: { min: 0.15, max: 0.5 },
    lightness: { min: 0.08, max: 0.95 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'blues',
  },

  {
    id: 'arctic',
    name: 'Arctic',
    description: 'Icy cold blue theme',
    baseHue: 200,
    secondaryHueOffset: -15,
    saturation: { min: 0.1, max: 0.4 },
    lightness: { min: 0.08, max: 0.96 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'blues',
  },

  {
    id: 'storm',
    name: 'Storm',
    description: 'Moody gray-blue theme',
    baseHue: 215,
    secondaryHueOffset: 10,
    saturation: { min: 0.08, max: 0.3 },
    lightness: { min: 0.07, max: 0.94 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'blues',
  },

  // ============================================
  // DARK THEMES - Greens (3)
  // ============================================

  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep natural green theme',
    baseHue: 145,
    secondaryHueOffset: 20,
    saturation: { min: 0.15, max: 0.45 },
    lightness: { min: 0.08, max: 0.95 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'greens',
  },

  {
    id: 'jade',
    name: 'Jade',
    description: 'Elegant green stone theme',
    baseHue: 165,
    secondaryHueOffset: 30, // Push accent toward cyan (195°)
    saturation: { min: 0.12, max: 0.4 },
    lightness: { min: 0.08, max: 0.95 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'greens',
  },

  {
    id: 'matrix',
    name: 'Matrix',
    description: 'Bright cyberpunk green theme',
    baseHue: 150,
    secondaryHueOffset: 40, // Push accent toward cyan (190°)
    saturation: { min: 0.25, max: 0.6 },
    lightness: { min: 0.06, max: 0.96 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'greens',
  },

  // ============================================
  // DARK THEMES - Warm Colors (4)
  // ============================================

  {
    id: 'ember',
    name: 'Ember',
    description: 'Glowing red-orange theme',
    baseHue: 15,
    secondaryHueOffset: 10,
    saturation: { min: 0.2, max: 0.55 },
    lightness: { min: 0.1, max: 0.95 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'warm',
  },

  {
    id: 'copper',
    name: 'Copper',
    description: 'Warm metallic orange theme',
    baseHue: 25,
    secondaryHueOffset: -10,
    saturation: { min: 0.15, max: 0.45 },
    lightness: { min: 0.1, max: 0.94 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'warm',
  },

  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Golden orange dusk theme',
    baseHue: 35,
    secondaryHueOffset: 15,
    saturation: { min: 0.2, max: 0.55 },
    lightness: { min: 0.1, max: 0.95 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'warm',
  },

  {
    id: 'mocha',
    name: 'Mocha',
    description: 'Rich coffee brown theme',
    baseHue: 30,
    secondaryHueOffset: 5,
    saturation: { min: 0.1, max: 0.35 },
    lightness: { min: 0.1, max: 0.93 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'warm',
  },

  // ============================================
  // DARK THEMES - Purples & Pinks (3)
  // ============================================

  {
    id: 'amethyst',
    name: 'Amethyst',
    description: 'Rich purple crystal theme',
    baseHue: 280,
    secondaryHueOffset: 20,
    saturation: { min: 0.15, max: 0.45 },
    lightness: { min: 0.1, max: 0.94 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'purple',
  },

  {
    id: 'twilight',
    name: 'Twilight',
    description: 'Purple-blue evening theme',
    baseHue: 260,
    secondaryHueOffset: 25,
    saturation: { min: 0.15, max: 0.45 },
    lightness: { min: 0.1, max: 0.94 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'purple',
  },

  {
    id: 'rose',
    name: 'Rose',
    description: 'Deep pink floral theme',
    baseHue: 345,
    secondaryHueOffset: -15,
    saturation: { min: 0.15, max: 0.45 },
    lightness: { min: 0.1, max: 0.94 },
    brightness: 'dark',
    contrastFactor: 1.0,
    colorFamily: 'pink',
  },
];

/**
 * Get a specific preset by ID.
 */
export function getPreset(id: string): ThemeGeneratorInput | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}

/**
 * Get all presets for a specific brightness.
 */
export function getPresetsByBrightness(
  brightness: 'light' | 'dark'
): ThemeGeneratorInput[] {
  return THEME_PRESETS.filter((p) => p.brightness === brightness);
}

/**
 * Get all presets for a specific color family.
 */
export function getPresetsByColorFamily(
  colorFamily: 'blues' | 'greens' | 'warm' | 'purple' | 'pink' | 'neutral'
): ThemeGeneratorInput[] {
  return THEME_PRESETS.filter((p) => p.colorFamily === colorFamily);
}
