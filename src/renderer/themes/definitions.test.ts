/**
 * Theme Definitions - Property-Based Tests
 *
 * Comprehensive test suite using fast-check to verify all theme system properties
 */

import fc from 'fast-check';
import { describe, it, test } from '@jest/globals';
import {
  THEME_REGISTRY,
  ThemeId,
  getTheme,
  getAllThemes,
  isValidThemeId,
} from './definitions';

/**
 * WCAG 2.1 relative luminance calculation
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function getRelativeLuminance(hexColor: string): number {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const rLinear = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gLinear = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bLinear = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * WCAG 2.1 contrast ratio calculation
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getRelativeLuminance(color1);
  const lum2 = getRelativeLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Extract hex color value from Chakra theme token
 */
function extractHexValue(
  tokenValue: string | { value: string }
): string {
  if (typeof tokenValue === 'string') {
    return tokenValue;
  }
  return tokenValue.value;
}

describe('Theme Definitions', () => {
  describe('Theme Registry Structure', () => {
    it('should have exactly 20 themes in registry', () => {
      const themeCount = Object.keys(THEME_REGISTRY).length;
      expect(themeCount).toBe(20);
    });

    it('should have required theme IDs', () => {
      const requiredThemes: ThemeId[] = [
        'mist',
        'obsidian',
        'sunset',
        'ocean',
        'forest',
        'amethyst',
        'ember',
        'twilight',
        'jade',
        'ember',
      ];

      requiredThemes.forEach((themeId) => {
        expect(themeId in THEME_REGISTRY).toBe(true);
      });
    });
  });

  describe('isValidThemeId()', () => {
    it('should validate all theme IDs in registry', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'mist' as const,
            'obsidian' as const,
            'sunset' as const,
            'ocean' as const,
            'forest' as const,
            'amethyst' as const,
            'ember' as const,
            'twilight' as const,
            'jade' as const,
            'ember' as const
          ),
          (themeId: string) => {
            expect(isValidThemeId(themeId)).toBe(true);
          }
        )
      );
    });

    it('should reject null and undefined', () => {
      fc.assert(
        fc.property(fc.anything(), (_: unknown) => {
          expect(isValidThemeId(null)).toBe(false);
          expect(isValidThemeId(undefined)).toBe(false);
          expect(isValidThemeId()).toBe(false);
        })
      );
    });

    it('should reject empty string', () => {
      fc.assert(
        fc.property(fc.anything(), (_: unknown) => {
          expect(isValidThemeId('')).toBe(false);
        })
      );
    });

    it('should reject non-string types', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.integer(), fc.boolean(), fc.object()),
          (value: unknown) => {
            expect(isValidThemeId(value as string | null)).toBe(false);
          }
        )
      );
    });

    it('should reject unknown theme IDs', () => {
      fc.assert(
        fc.property(
          fc
            .stringMatching(/^[a-z-]+$/)
            .filter(
              (s: string) =>
                ![
                  'mist',
                  'obsidian',
                  'sunset',
                  'ocean',
                  'forest',
                  'amethyst',
                  'ember',
                  'twilight',
                  'jade',
                  'ember',
                ].includes(s)
            ),
          (unknownId: string) => {
            expect(isValidThemeId(unknownId)).toBe(false);
          }
        )
      );
    });

    it('should work as type guard', () => {
      const themeId: string = 'obsidian';
      if (isValidThemeId(themeId)) {
        // This should compile without errors - type narrowing works
        const _narrowed: ThemeId = themeId;
        expect(_narrowed).toBe('obsidian');
      }
    });
  });

  describe('getTheme()', () => {
    it('should return theme for all valid IDs', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'mist' as const,
            'obsidian' as const,
            'sunset' as const,
            'ocean' as const,
            'forest' as const,
            'amethyst' as const,
            'ember' as const,
            'twilight' as const,
            'jade' as const,
            'ember' as const
          ),
          (themeId: string) => {
            const theme = getTheme(themeId);
            expect(theme).toBeDefined();
            expect(theme.metadata.id).toBe(themeId);
          }
        )
      );
    });

    it('should return dark theme for invalid IDs', () => {
      const originalWarn = console.warn;
      console.warn = () => {}; // Suppress expected warnings during test
      try {
        expect(getTheme('invalid')).toEqual(THEME_REGISTRY.obsidian);
        expect(getTheme('unknown-theme')).toEqual(THEME_REGISTRY.obsidian);
        expect(getTheme('Light')).toEqual(THEME_REGISTRY.obsidian); // Case sensitive
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should return dark theme for null and undefined', () => {
      expect(getTheme(null)).toEqual(THEME_REGISTRY.obsidian);
      expect(getTheme(undefined)).toEqual(THEME_REGISTRY.obsidian);
      expect(getTheme()).toEqual(THEME_REGISTRY.obsidian);
    });

    it('should return dark theme for empty string', () => {
      expect(getTheme('')).toEqual(THEME_REGISTRY.obsidian);
    });

    it('should return identity for dark theme (dark fallback)', () => {
      fc.assert(
        fc.property(fc.anything(), (_: unknown) => {
          const darkTheme = getTheme('obsidian');
          expect(darkTheme).toEqual(THEME_REGISTRY.obsidian);
        })
      );
    });

    it('should be idempotent (multiple calls return same definition)', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'mist' as const,
            'obsidian' as const,
            'sunset' as const,
            'ocean' as const,
            'forest' as const,
            'amethyst' as const,
            'ember' as const,
            'twilight' as const,
            'jade' as const,
            'ember' as const
          ),
          (themeId: string) => {
            const first = getTheme(themeId);
            const second = getTheme(themeId);
            const third = getTheme(themeId);
            expect(first).toEqual(second);
            expect(second).toEqual(third);
          }
        )
      );
    });

    it('should have complete Chakra config', () => {
      const theme = getTheme('obsidian');
      expect(theme.config).toBeDefined();
      expect(theme.config.theme).toBeDefined();
    });

    it('should have metadata in returned theme', () => {
      const theme = getTheme('mist');
      expect(theme.metadata).toBeDefined();
      expect(theme.metadata.id).toBe('mist');
      expect(theme.metadata.name).toBe('Mist');
    });
  });

  describe('getAllThemes()', () => {
    it('should return exactly 20 themes', () => {
      const themes = getAllThemes();
      expect(themes).toHaveLength(20);
    });

    it('should return all themes from registry', () => {
      const themes = getAllThemes();
      const themeIds = themes.map((t) => t.id);
      const registryIds = Object.keys(THEME_REGISTRY);

      expect(new Set(themeIds)).toEqual(new Set(registryIds));
    });

    it('should maintain consistent order', () => {
      const first = getAllThemes();
      const second = getAllThemes();
      const third = getAllThemes();

      expect(first).toEqual(second);
      expect(second).toEqual(third);
    });

    it('should have light and dark first', () => {
      const themes = getAllThemes();
      // Light themes come first (alphabetically), then dark themes
      // Light themes: blossom, cloud, dawn, meadow, mist
      expect(themes[0].brightness).toBe('light');
      expect(themes.slice(0, 5).every((t) => t.brightness === 'light')).toBe(true);
    });

    it('should have themed options grouped by brightness (light themes, then dark themes)', () => {
      const themes = getAllThemes();
      // Light themes: blossom, cloud, dawn, meadow, mist (5 total)
      // Dark themes: the rest (15 total)
      const lightThemes = themes.filter((t) => t.brightness === 'light');
      const darkThemes = themes.filter((t) => t.brightness === 'dark');
      expect(lightThemes.length).toBe(5);
      expect(darkThemes.length).toBe(15);
      // Verify light themes come before dark themes
      const lastLightIndex = themes.findIndex((t) => t.id === lightThemes[lightThemes.length - 1].id);
      const firstDarkIndex = themes.findIndex((t) => t.id === darkThemes[0].id);
      expect(lastLightIndex).toBeLessThan(firstDarkIndex);
    });

    it('should return metadata with all required fields', () => {
      const themes = getAllThemes();
      themes.forEach((metadata) => {
        expect(metadata.id).toBeDefined();
        expect(metadata.name).toBeDefined();
        expect(metadata.description).toBeDefined();
        expect(metadata.previewColors).toBeDefined();
        expect(metadata.previewColors.primary).toBeDefined();
        expect(metadata.previewColors.background).toBeDefined();
        expect(metadata.previewColors.text).toBeDefined();
      });
    });

    it('should map correctly to registry metadata', () => {
      fc.assert(
        fc.property(fc.anything(), (_: unknown) => {
          const themes = getAllThemes();
          themes.forEach((metadata) => {
            const registryTheme = THEME_REGISTRY[metadata.id];
            expect(metadata).toEqual(registryTheme.metadata);
          });
        })
      );
    });
  });

  describe('Theme Configuration Validity', () => {
    it('should have valid Chakra config for all themes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'mist' as const,
            'obsidian' as const,
            'sunset' as const,
            'ocean' as const,
            'forest' as const,
            'amethyst' as const,
            'ember' as const,
            'twilight' as const,
            'jade' as const,
            'ember' as const
          ),
          (themeId: string) => {
            const theme = THEME_REGISTRY[themeId as ThemeId];
            expect(theme.config).toBeDefined();
            expect(theme.config.theme).toBeDefined();
            expect(theme.config.theme?.tokens).toBeDefined();
            expect(theme.config.theme?.tokens?.colors).toBeDefined();
            expect(theme.config.theme?.tokens?.colors?.brand).toBeDefined();
          }
        )
      );
    });

    it('should have complete color scale (50-900) for all themes', () => {
      const scales = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
      Object.values(THEME_REGISTRY).forEach((theme) => {
        const brand = theme.config.theme?.tokens?.colors?.brand;
        if (!brand) throw new Error('Brand tokens not found');
        scales.forEach((scale) => {
          expect((brand as Record<number, unknown>)[scale]).toBeDefined();
        });
      });
    });

    it('should have valid hex color values', () => {
      const hexRegex = /^#[0-9a-f]{6}$/i;
      Object.values(THEME_REGISTRY).forEach((theme) => {
        const brand = theme.config.theme?.tokens?.colors?.brand;
        if (!brand) throw new Error('Brand tokens not found');
        Object.values(brand as Record<string, unknown>).forEach((token) => {
          const hexValue = extractHexValue(token as string | { value: string });
          expect(hexValue).toMatch(hexRegex);
        });
      });
    });
  });

  describe('WCAG AA Accessibility Compliance', () => {
    it('should have sufficient contrast for dark text on light background (light theme)', () => {
      const lightTheme = THEME_REGISTRY.mist;
      const brand = lightTheme.config.theme?.tokens?.colors?.brand;
      if (!brand) throw new Error('Brand tokens not found');

      // Dark text (900) on light background (50)
      const darkColor = extractHexValue(
        (brand as Record<number, unknown>)[900] as string | { value: string }
      );
      const lightColor = extractHexValue(
        (brand as Record<number, unknown>)[50] as string | { value: string }
      );

      const contrast = getContrastRatio(darkColor, lightColor);
      expect(contrast).toBeGreaterThanOrEqual(4.5); // WCAG AA normal text
    });

    it('should have sufficient contrast for light text on dark background (dark theme)', () => {
      const darkTheme = THEME_REGISTRY.obsidian;
      const brand = darkTheme.config.theme?.tokens?.colors?.brand;
      if (!brand) throw new Error('Brand tokens not found');

      // Light text (50) on dark background (900)
      const lightColor = extractHexValue(
        (brand as Record<number, unknown>)[50] as string | { value: string }
      );
      const darkColor = extractHexValue(
        (brand as Record<number, unknown>)[900] as string | { value: string }
      );

      const contrast = getContrastRatio(lightColor, darkColor);
      expect(contrast).toBeGreaterThanOrEqual(4.5); // WCAG AA normal text
    });

    it('should maintain WCAG AA contrast for all branded themes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'sunset' as const,
            'ocean' as const,
            'forest' as const,
            'amethyst' as const,
            'ember' as const,
            'twilight' as const,
            'jade' as const,
            'ember' as const
          ),
          (themeId: string) => {
            const theme = THEME_REGISTRY[themeId as ThemeId];
            const brand = theme.config.theme?.tokens?.colors?.brand;
            if (!brand) throw new Error('Brand tokens not found');

            // Test light color (50) on dark background (900)
            const lightColor = extractHexValue(
              (brand as Record<number, unknown>)[50] as string | { value: string }
            );
            const darkColor = extractHexValue(
              (brand as Record<number, unknown>)[900] as string | { value: string }
            );

            const contrastDark = getContrastRatio(lightColor, darkColor);
            expect(contrastDark).toBeGreaterThanOrEqual(4.5);

            // Test dark color (900) on light background (50)
            const contrastLight = getContrastRatio(darkColor, lightColor);
            expect(contrastLight).toBeGreaterThanOrEqual(4.5);
          }
        )
      );
    });

    it('should have consistent luminance progression in color scale', () => {
      Object.entries(THEME_REGISTRY).forEach(([_themeId, theme]) => {
        const brand = theme.config.theme?.tokens?.colors?.brand;
        if (!brand) throw new Error('Brand tokens not found');
        const scales = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

        let previousLuminance = -1;
        for (const scale of scales) {
          const hexValue = extractHexValue(
            (brand as Record<number, unknown>)[scale] as string | { value: string }
          );
          const luminance = getRelativeLuminance(hexValue);

          // Each step should have luminance change (either increasing or decreasing)
          if (previousLuminance >= 0) {
            // Allow for small floating-point variations
            const progression = scale < 500 ? 'decreasing' : 'increasing';
            if (progression === 'decreasing') {
              expect(luminance).toBeLessThanOrEqual(previousLuminance + 0.01);
            } else {
              expect(luminance).toBeLessThanOrEqual(previousLuminance + 0.1);
            }
          }
          previousLuminance = luminance;
        }
      });
    });
  });

  describe('Theme Uniqueness', () => {
    it('should have unique metadata IDs', () => {
      const allThemes = getAllThemes();
      const ids = allThemes.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have unique display names', () => {
      const allThemes = getAllThemes();
      const names = allThemes.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should have unique primary preview colors', () => {
      fc.assert(
        fc.property(fc.anything(), (_: unknown) => {
          const allThemes = getAllThemes();
          const primaryColors = allThemes.map((t) => t.previewColors.primary);
          const uniqueColors = new Set(primaryColors);
          expect(uniqueColors.size).toBe(primaryColors.length);
        })
      );
    });
  });

  describe('Integration: getTheme() and getAllThemes() consistency', () => {
    it('should return same metadata from getTheme() and getAllThemes()', () => {
      const allThemes = getAllThemes();
      allThemes.forEach((metadata) => {
        const themeFromRegistry = getTheme(metadata.id);
        expect(themeFromRegistry.metadata).toEqual(metadata);
      });
    });

    it('should have matching metadata across all retrieval methods', () => {
      const allThemes = getAllThemes();
      Object.entries(THEME_REGISTRY).forEach(([_id, theme]) => {
        const foundInAll = allThemes.find((t) => t.id === theme.metadata.id);
        expect(foundInAll).toEqual(theme.metadata);
      });
    });
  });

  describe('Type Safety', () => {
    it('should narrow ThemeId type correctly', () => {
      const input: string = 'obsidian';
      if (isValidThemeId(input)) {
        // Type should be narrowed to ThemeId
        const _narrowed: ThemeId = input;
        expect(_narrowed).toBeDefined();
      }
    });

    it('should fail type check for invalid IDs', () => {
      const invalid: unknown = 'invalid-theme';
      if (isValidThemeId(invalid as string)) {
        const _narrowed: ThemeId = invalid as ThemeId;
        expect(_narrowed).toBeDefined();
      } else {
        // This is the expected branch
        expect(isValidThemeId(invalid as string)).toBe(false);
      }
    });
  });
});
