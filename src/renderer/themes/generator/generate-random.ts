/**
 * Generate Random Themes
 *
 * Creates a diverse set of themes with random parameters,
 * validates them, and suggests names based on color characteristics.
 */

import { ThemeGenerator } from './index';
import { oklchToHex, hexToOklch, contrastRatio } from './oklch';
import type { ThemeGeneratorInput } from './types';
import type { ColorFamily, ThemeBrightness } from '../schema';

// Evocative name components based on hue ranges
const HUE_NAMES: Record<string, string[]> = {
  red: ['crimson', 'ruby', 'scarlet', 'garnet', 'flame', 'ember', 'cherry', 'cardinal'],
  orange: ['tangerine', 'copper', 'rust', 'amber', 'apricot', 'peach', 'terracotta', 'coral'],
  yellow: ['gold', 'honey', 'saffron', 'canary', 'citrine', 'maize', 'buttercup', 'dandelion'],
  lime: ['chartreuse', 'lime', 'spring', 'fern', 'moss', 'verdant', 'leaf', 'sprout'],
  green: ['forest', 'jade', 'emerald', 'pine', 'sage', 'ivy', 'clover', 'basil'],
  teal: ['teal', 'cyan', 'turquoise', 'lagoon', 'aqua', 'seafoam', 'marine', 'reef'],
  blue: ['azure', 'cobalt', 'sapphire', 'ocean', 'sky', 'denim', 'navy', 'steel'],
  indigo: ['indigo', 'midnight', 'twilight', 'dusk', 'storm', 'slate', 'shadow', 'deep'],
  purple: ['violet', 'amethyst', 'plum', 'orchid', 'grape', 'iris', 'heather', 'lavender'],
  pink: ['rose', 'coral', 'blush', 'peony', 'sakura', 'fuschia', 'magenta', 'berry'],
};

const BRIGHTNESS_MODIFIERS: Record<ThemeBrightness, string[]> = {
  light: ['dawn', 'morning', 'bright', 'soft', 'pale', 'mist', 'cloud', 'frost'],
  dark: ['night', 'deep', 'shadow', 'dark', 'noir', 'obsidian', 'void', 'abyss'],
};

/**
 * Get the hue category name for a given hue angle.
 */
function getHueCategory(hue: number): string {
  const normalized = ((hue % 360) + 360) % 360;
  if (normalized < 15 || normalized >= 345) return 'red';
  if (normalized < 45) return 'orange';
  if (normalized < 75) return 'yellow';
  if (normalized < 105) return 'lime';
  if (normalized < 150) return 'green';
  if (normalized < 195) return 'teal';
  if (normalized < 255) return 'blue';
  if (normalized < 285) return 'indigo';
  if (normalized < 330) return 'purple';
  return 'pink';
}

/**
 * Get the color family for a given hue.
 */
function getColorFamily(hue: number): ColorFamily {
  const category = getHueCategory(hue);
  switch (category) {
    case 'green':
    case 'lime':
    case 'teal':
      return 'greens';
    case 'blue':
    case 'indigo':
      return 'blues';
    case 'purple':
      return 'purple';
    case 'pink':
    case 'red':
      return 'pink';
    case 'orange':
    case 'yellow':
      return 'warm';
    default:
      return 'neutral';
  }
}

/**
 * Generate a unique theme name based on hue and brightness.
 */
function generateThemeName(hue: number, brightness: ThemeBrightness, usedNames: Set<string>): string {
  const category = getHueCategory(hue);
  const hueNames = HUE_NAMES[category] || HUE_NAMES.blue;
  const modifiers = BRIGHTNESS_MODIFIERS[brightness];

  // Try combinations until we find an unused name
  for (const hueName of hueNames) {
    if (!usedNames.has(hueName)) {
      usedNames.add(hueName);
      return hueName;
    }
    for (const mod of modifiers) {
      const combined = `${hueName}-${mod}`;
      if (!usedNames.has(combined)) {
        usedNames.add(combined);
        return combined;
      }
    }
  }

  // Fallback: add random suffix
  const base = hueNames[Math.floor(Math.random() * hueNames.length)];
  const suffix = Math.floor(Math.random() * 100);
  const name = `${base}-${suffix}`;
  usedNames.add(name);
  return name;
}

/**
 * Generate a random number within a range.
 */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Generate a random theme input with reasonable parameters.
 */
function generateRandomInput(
  brightness: ThemeBrightness,
  usedNames: Set<string>
): ThemeGeneratorInput {
  // Random hue across the full spectrum
  const baseHue = rand(0, 360);

  // Secondary offset: analogous (±30) or complementary (±120-180)
  const offsetType = Math.random();
  let secondaryHueOffset: number;
  if (offsetType < 0.6) {
    // Analogous (more common)
    secondaryHueOffset = rand(-30, 30);
  } else if (offsetType < 0.85) {
    // Split complementary
    secondaryHueOffset = rand(120, 150) * (Math.random() < 0.5 ? 1 : -1);
  } else {
    // Triadic
    secondaryHueOffset = rand(100, 140) * (Math.random() < 0.5 ? 1 : -1);
  }

  // Saturation: moderate to high
  const satMin = rand(0.1, 0.25);
  const satMax = rand(0.5, 0.85);

  // Lightness: appropriate for brightness mode
  let lightMin: number, lightMax: number;
  if (brightness === 'dark') {
    lightMin = rand(0.05, 0.12);
    lightMax = rand(0.92, 0.98);
  } else {
    lightMin = rand(0.08, 0.15);
    lightMax = rand(0.95, 0.99);
  }

  const name = generateThemeName(baseHue, brightness, usedNames);
  const displayName = name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    id: name,
    name: displayName,
    description: `${displayName} ${brightness} theme`,
    baseHue: Math.round(baseHue),
    secondaryHueOffset: Math.round(secondaryHueOffset),
    saturation: {
      min: Math.round(satMin * 100) / 100,
      max: Math.round(satMax * 100) / 100,
    },
    lightness: {
      min: Math.round(lightMin * 100) / 100,
      max: Math.round(lightMax * 100) / 100,
    },
    brightness,
    contrastFactor: 1.0,
    colorFamily: getColorFamily(baseHue),
  };
}

/**
 * Generate a set of diverse random themes.
 */
function generateRandomThemes(count: number): ThemeGeneratorInput[] {
  const usedNames = new Set<string>();
  const themes: ThemeGeneratorInput[] = [];

  // Ensure a good mix of light and dark themes
  const lightCount = Math.max(3, Math.floor(count * 0.25));
  const darkCount = count - lightCount;

  // Generate light themes
  for (let i = 0; i < lightCount; i++) {
    themes.push(generateRandomInput('light', usedNames));
  }

  // Generate dark themes
  for (let i = 0; i < darkCount; i++) {
    themes.push(generateRandomInput('dark', usedNames));
  }

  return themes;
}

// Main execution
console.log('Generating Random Themes');
console.log('='.repeat(60));
console.log();

const targetCount = 20;
const randomThemes = generateRandomThemes(targetCount);

console.log(`Generated ${randomThemes.length} theme configurations:`);
console.log();

// Try to generate and validate each theme
const validThemes: ThemeGeneratorInput[] = [];
const invalidThemes: { input: ThemeGeneratorInput; errors: string[] }[] = [];

for (const input of randomThemes) {
  try {
    const result = ThemeGenerator.generate(input, false);
    if (result.validation.valid) {
      validThemes.push(input);
      console.log(`  ✓ ${input.name} (${input.brightness}, hue=${input.baseHue}°)`);
    } else {
      invalidThemes.push({
        input,
        errors: result.validation.errors.map((e) => e.message),
      });
      console.log(`  ✗ ${input.name} - ${result.validation.errors.length} errors`);
    }
  } catch (error) {
    console.log(`  ✗ ${input.name} - Generation failed`);
  }
}

console.log();
console.log('='.repeat(60));
console.log(`Valid: ${validThemes.length}, Invalid: ${invalidThemes.length}`);
console.log();

// Output the valid themes as preset definitions
if (validThemes.length > 0) {
  console.log('VALID THEME PRESETS (copy to presets/index.ts):');
  console.log();
  console.log('export const THEME_PRESETS: ThemeGeneratorInput[] = [');
  for (const theme of validThemes) {
    console.log(`  {
    id: '${theme.id}',
    name: '${theme.name}',
    description: '${theme.description}',
    baseHue: ${theme.baseHue},
    secondaryHueOffset: ${theme.secondaryHueOffset},
    saturation: { min: ${theme.saturation.min}, max: ${theme.saturation.max} },
    lightness: { min: ${theme.lightness.min}, max: ${theme.lightness.max} },
    brightness: '${theme.brightness}',
    contrastFactor: 1.0,
    colorFamily: '${theme.colorFamily}',
  },`);
  }
  console.log('];');
}
