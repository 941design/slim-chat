/**
 * Theme Filtering - Property-Based Tests
 *
 * Comprehensive test suite using fast-check to verify filtering functions
 * against specification contracts and invariants.
 */

import fc from 'fast-check';
import { describe, it } from '@jest/globals';
import { ThemeMetadata } from '../../themes/definitions';
import { ThemeFilters, BrightnessFilter, ColorFamilyFilter } from './types';
import {
  filterThemes,
  matchesBrightness,
  matchesColorFamily,
} from './filterThemes';

/**
 * Arbitraries for property-based testing
 */
const themeIdArbitrary = fc.constantFrom(
  'light',
  'dark',
  'sunset',
  'ocean',
  'forest',
  'purple-haze',
  'ember',
  'twilight',
  'mint',
  'amber'
);

const brightnessFilterArbitrary = fc.constantFrom<BrightnessFilter>(
  'all',
  'light',
  'dark'
);

const colorFamilyFilterArbitrary = fc.constantFrom<ColorFamilyFilter>(
  'all',
  'blues',
  'greens',
  'warm',
  'purple'
);

const themeMetadataArbitrary = themeIdArbitrary.map(
  (id): ThemeMetadata => ({
    id: id as any,
    name: `Theme ${id}`,
    description: `Test theme ${id}`,
    previewColors: {
      primary: '#000000',
      background: '#ffffff',
      text: '#333333',
    },
  })
);

const themeListArbitrary = fc
  .array(themeMetadataArbitrary, { minLength: 1, maxLength: 10 })
  .map((themes) => {
    // Ensure uniqueness by theme ID
    const seen = new Set<string>();
    return themes.filter((theme) => {
      if (seen.has(theme.id)) return false;
      seen.add(theme.id);
      return true;
    });
  });

const themesWithFiltersArbitrary = fc.tuple(
  themeListArbitrary,
  brightnessFilterArbitrary,
  colorFamilyFilterArbitrary
);

describe('filterThemes()', () => {
  // P001: Identity property - no filters returns all input themes
  it('P001: should return all input themes when both filters are "all"', () => {
    fc.assert(
      fc.property(
        themeListArbitrary,
        (themes: ThemeMetadata[]) => {
          const result = filterThemes(themes, {
            brightness: 'all',
            colorFamily: 'all',
          });

          expect(result).toEqual(themes);
        }
      )
    );
  });

  // P002: Subset property - output is always subset of input
  it('P002: should return only themes that exist in input', () => {
    fc.assert(
      fc.property(
        themesWithFiltersArbitrary,
        ([themes, brightness, colorFamily]: [
          ThemeMetadata[],
          BrightnessFilter,
          ColorFamilyFilter,
        ]) => {
          const result = filterThemes(themes, { brightness, colorFamily });
          const inputIds = new Set(themes.map((t) => t.id));

          result.forEach((theme) => {
            expect(inputIds.has(theme.id)).toBe(true);
          });
        }
      )
    );
  });

  // P003: Order preservation - output maintains input order
  it('P003: should preserve input theme order in output', () => {
    fc.assert(
      fc.property(
        themesWithFiltersArbitrary,
        ([themes, brightness, colorFamily]: [
          ThemeMetadata[],
          BrightnessFilter,
          ColorFamilyFilter,
        ]) => {
          const result = filterThemes(themes, { brightness, colorFamily });
          const inputIndices = new Map<string, number>();
          themes.forEach((theme, idx) => inputIndices.set(theme.id, idx));

          for (let i = 0; i < result.length - 1; i++) {
            const currentIdx = inputIndices.get(result[i].id) ?? -1;
            const nextIdx = inputIndices.get(result[i + 1].id) ?? -1;
            expect(currentIdx).toBeLessThan(nextIdx);
          }
        }
      )
    );
  });

  // P004: Monotonic property - more restrictive filters reduce output size
  it('P004: should never increase output size when adding brightness restriction', () => {
    fc.assert(
      fc.property(
        fc.tuple(themeListArbitrary, colorFamilyFilterArbitrary),
        ([themes, colorFamily]: [ThemeMetadata[], ColorFamilyFilter]) => {
          const allBrightnessResult = filterThemes(themes, {
            brightness: 'all',
            colorFamily,
          });

          const lightResult = filterThemes(themes, {
            brightness: 'light',
            colorFamily,
          });

          const darkResult = filterThemes(themes, {
            brightness: 'dark',
            colorFamily,
          });

          expect(lightResult.length).toBeLessThanOrEqual(allBrightnessResult.length);
          expect(darkResult.length).toBeLessThanOrEqual(allBrightnessResult.length);
        }
      )
    );
  });

  // P005: Monotonic property - color family restrictions reduce output size
  it('P005: should never increase output size when adding color family restriction', () => {
    fc.assert(
      fc.property(
        fc.tuple(themeListArbitrary, brightnessFilterArbitrary),
        ([themes, brightness]: [ThemeMetadata[], BrightnessFilter]) => {
          const allColorResult = filterThemes(themes, {
            brightness,
            colorFamily: 'all',
          });

          const bluesResult = filterThemes(themes, {
            brightness,
            colorFamily: 'blues',
          });

          const greensResult = filterThemes(themes, {
            brightness,
            colorFamily: 'greens',
          });

          const warmResult = filterThemes(themes, {
            brightness,
            colorFamily: 'warm',
          });

          const purpleResult = filterThemes(themes, {
            brightness,
            colorFamily: 'purple',
          });

          expect(bluesResult.length).toBeLessThanOrEqual(allColorResult.length);
          expect(greensResult.length).toBeLessThanOrEqual(allColorResult.length);
          expect(warmResult.length).toBeLessThanOrEqual(allColorResult.length);
          expect(purpleResult.length).toBeLessThanOrEqual(allColorResult.length);
        }
      )
    );
  });

  // P006: Commutative property - filter order doesn't matter
  it('P006: should produce same result regardless of filter order', () => {
    fc.assert(
      fc.property(
        themesWithFiltersArbitrary,
        ([themes, brightness, colorFamily]: [
          ThemeMetadata[],
          BrightnessFilter,
          ColorFamilyFilter,
        ]) => {
          const directResult = filterThemes(themes, {
            brightness,
            colorFamily,
          });

          const brightnessThenColor = filterThemes(themes, {
            brightness,
            colorFamily: 'all',
          });
          const finalResult = filterThemes(brightnessThenColor, {
            brightness: 'all',
            colorFamily,
          });

          expect(directResult).toEqual(finalResult);
        }
      )
    );
  });

  // P007: Empty input produces empty output
  it('P007: should return empty array for empty input', () => {
    fc.assert(
      fc.property(
        fc.tuple(brightnessFilterArbitrary, colorFamilyFilterArbitrary),
        ([brightness, colorFamily]: [BrightnessFilter, ColorFamilyFilter]) => {
          const result = filterThemes([], { brightness, colorFamily });
          expect(result).toEqual([]);
        }
      )
    );
  });

  // P008: Deterministic - same inputs always produce same output
  it('P008: should be deterministic with same inputs', () => {
    fc.assert(
      fc.property(
        themesWithFiltersArbitrary,
        ([themes, brightness, colorFamily]: [
          ThemeMetadata[],
          BrightnessFilter,
          ColorFamilyFilter,
        ]) => {
          const filters = { brightness, colorFamily };
          const result1 = filterThemes(themes, filters);
          const result2 = filterThemes(themes, filters);
          const result3 = filterThemes(themes, filters);

          expect(result1).toEqual(result2);
          expect(result2).toEqual(result3);
        }
      )
    );
  });

  // P009: Output matches brightness filter criteria
  it('P009: all output themes should match brightness filter', () => {
    fc.assert(
      fc.property(
        themesWithFiltersArbitrary,
        ([themes, brightness, colorFamily]: [
          ThemeMetadata[],
          BrightnessFilter,
          ColorFamilyFilter,
        ]) => {
          const result = filterThemes(themes, { brightness, colorFamily });

          result.forEach((theme) => {
            expect(matchesBrightness(theme, brightness)).toBe(true);
          });
        }
      )
    );
  });

  // P010: Output matches color family filter criteria
  it('P010: all output themes should match color family filter', () => {
    fc.assert(
      fc.property(
        themesWithFiltersArbitrary,
        ([themes, brightness, colorFamily]: [
          ThemeMetadata[],
          BrightnessFilter,
          ColorFamilyFilter,
        ]) => {
          const result = filterThemes(themes, { brightness, colorFamily });

          result.forEach((theme) => {
            expect(matchesColorFamily(theme, colorFamily)).toBe(true);
          });
        }
      )
    );
  });

  // P011: Completeness - all matching themes are in output
  it('P011: should include all themes matching both filter criteria', () => {
    fc.assert(
      fc.property(
        themesWithFiltersArbitrary,
        ([themes, brightness, colorFamily]: [
          ThemeMetadata[],
          BrightnessFilter,
          ColorFamilyFilter,
        ]) => {
          const result = filterThemes(themes, { brightness, colorFamily });
          const resultIds = new Set(result.map((t) => t.id));

          themes.forEach((theme) => {
            const shouldMatch =
              matchesBrightness(theme, brightness) &&
              matchesColorFamily(theme, colorFamily);

            if (shouldMatch) {
              expect(resultIds.has(theme.id)).toBe(true);
            }
          });
        }
      )
    );
  });
});

describe('matchesBrightness()', () => {
  // P101: Identity property - 'all' filter matches everything
  it('P101: should match all themes when filter is "all"', () => {
    fc.assert(
      fc.property(themeMetadataArbitrary, (theme: ThemeMetadata) => {
        expect(matchesBrightness(theme, 'all')).toBe(true);
      })
    );
  });

  // P102: Light filter only matches 'light' theme
  it('P102: should match only "light" theme when filter is "light"', () => {
    fc.assert(
      fc.property(themeMetadataArbitrary, (theme: ThemeMetadata) => {
        const result = matchesBrightness(theme, 'light');
        expect(result).toBe(theme.id === 'light');
      })
    );
  });

  // P103: Dark filter matches everything except 'light'
  it('P103: should match all non-light themes when filter is "dark"', () => {
    fc.assert(
      fc.property(themeMetadataArbitrary, (theme: ThemeMetadata) => {
        const result = matchesBrightness(theme, 'dark');
        expect(result).toBe(theme.id !== 'light');
      })
    );
  });

  // P104: Exclusivity - exactly one of light/dark is true for each theme
  it('P104: should ensure exactly one of light/dark returns true', () => {
    fc.assert(
      fc.property(themeMetadataArbitrary, (theme: ThemeMetadata) => {
        const lightMatch = matchesBrightness(theme, 'light');
        const darkMatch = matchesBrightness(theme, 'dark');

        // For any theme, exactly one should be true
        const count = (lightMatch ? 1 : 0) + (darkMatch ? 1 : 0);
        expect(count).toBe(1);
      })
    );
  });

  // P105: Deterministic behavior
  it('P105: should be deterministic with same inputs', () => {
    fc.assert(
      fc.property(
        fc.tuple(themeMetadataArbitrary, brightnessFilterArbitrary),
        ([theme, filter]: [ThemeMetadata, BrightnessFilter]) => {
          const result1 = matchesBrightness(theme, filter);
          const result2 = matchesBrightness(theme, filter);
          const result3 = matchesBrightness(theme, filter);

          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
        }
      )
    );
  });

  // E101: Example test - light theme with light filter
  it('E101: light theme should match "light" filter', () => {
    const lightTheme: ThemeMetadata = {
      id: 'light',
      name: 'Light',
      description: 'Light theme',
      previewColors: {
        primary: '#0ea5e9',
        background: '#f8fafc',
        text: '#1e293b',
      },
    };

    expect(matchesBrightness(lightTheme, 'light')).toBe(true);
    expect(matchesBrightness(lightTheme, 'dark')).toBe(false);
  });

  // E102: Example test - dark theme with dark filter
  it('E102: dark theme should match "dark" filter', () => {
    const darkTheme: ThemeMetadata = {
      id: 'dark',
      name: 'Dark',
      description: 'Dark theme',
      previewColors: {
        primary: '#38bdf8',
        background: '#0f172a',
        text: '#e2e8f0',
      },
    };

    expect(matchesBrightness(darkTheme, 'dark')).toBe(true);
    expect(matchesBrightness(darkTheme, 'light')).toBe(false);
  });
});

describe('matchesColorFamily()', () => {
  // P201: Identity property - 'all' filter matches everything
  it('P201: should match all themes when filter is "all"', () => {
    fc.assert(
      fc.property(themeMetadataArbitrary, (theme: ThemeMetadata) => {
        expect(matchesColorFamily(theme, 'all')).toBe(true);
      })
    );
  });

  // P202: Blues family contains correct themes
  it('P202: should match only blues themes when filter is "blues"', () => {
    const bluesThemeIds = new Set(['light', 'dark', 'ocean', 'twilight']);

    fc.assert(
      fc.property(themeMetadataArbitrary, (theme: ThemeMetadata) => {
        const result = matchesColorFamily(theme, 'blues');
        expect(result).toBe(bluesThemeIds.has(theme.id));
      })
    );
  });

  // P203: Greens family contains correct themes
  it('P203: should match only greens themes when filter is "greens"', () => {
    const greensThemeIds = new Set(['forest', 'mint']);

    fc.assert(
      fc.property(themeMetadataArbitrary, (theme: ThemeMetadata) => {
        const result = matchesColorFamily(theme, 'greens');
        expect(result).toBe(greensThemeIds.has(theme.id));
      })
    );
  });

  // P204: Warm family contains correct themes
  it('P204: should match only warm themes when filter is "warm"', () => {
    const warmThemeIds = new Set(['sunset', 'ember', 'amber']);

    fc.assert(
      fc.property(themeMetadataArbitrary, (theme: ThemeMetadata) => {
        const result = matchesColorFamily(theme, 'warm');
        expect(result).toBe(warmThemeIds.has(theme.id));
      })
    );
  });

  // P205: Purple family contains only purple-haze
  it('P205: should match only purple-haze when filter is "purple"', () => {
    fc.assert(
      fc.property(themeMetadataArbitrary, (theme: ThemeMetadata) => {
        const result = matchesColorFamily(theme, 'purple');
        expect(result).toBe(theme.id === 'purple-haze');
      })
    );
  });

  // P206: Coverage property - each theme in exactly one family
  it('P206: should have each theme in exactly one color family', () => {
    fc.assert(
      fc.property(themeMetadataArbitrary, (theme: ThemeMetadata) => {
        const families = [
          matchesColorFamily(theme, 'blues'),
          matchesColorFamily(theme, 'greens'),
          matchesColorFamily(theme, 'warm'),
          matchesColorFamily(theme, 'purple'),
        ];

        const count = families.filter((match) => match).length;
        expect(count).toBe(1);
      })
    );
  });

  // P207: Deterministic behavior
  it('P207: should be deterministic with same inputs', () => {
    fc.assert(
      fc.property(
        fc.tuple(themeMetadataArbitrary, colorFamilyFilterArbitrary),
        ([theme, filter]: [ThemeMetadata, ColorFamilyFilter]) => {
          const result1 = matchesColorFamily(theme, filter);
          const result2 = matchesColorFamily(theme, filter);
          const result3 = matchesColorFamily(theme, filter);

          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
        }
      )
    );
  });

  // E201: Example - ocean theme is in blues family
  it('E201: ocean theme should match "blues" color family', () => {
    const oceanTheme: ThemeMetadata = {
      id: 'ocean',
      name: 'Ocean',
      description: 'Ocean theme',
      previewColors: {
        primary: '#06b6d4',
        background: '#0c1821',
        text: '#99f6e4',
      },
    };

    expect(matchesColorFamily(oceanTheme, 'blues')).toBe(true);
    expect(matchesColorFamily(oceanTheme, 'greens')).toBe(false);
    expect(matchesColorFamily(oceanTheme, 'warm')).toBe(false);
    expect(matchesColorFamily(oceanTheme, 'purple')).toBe(false);
  });

  // E202: Example - forest theme is in greens family
  it('E202: forest theme should match "greens" color family', () => {
    const forestTheme: ThemeMetadata = {
      id: 'forest',
      name: 'Forest',
      description: 'Forest theme',
      previewColors: {
        primary: '#22c55e',
        background: '#0a1f0a',
        text: '#bbf7d0',
      },
    };

    expect(matchesColorFamily(forestTheme, 'greens')).toBe(true);
    expect(matchesColorFamily(forestTheme, 'blues')).toBe(false);
    expect(matchesColorFamily(forestTheme, 'warm')).toBe(false);
    expect(matchesColorFamily(forestTheme, 'purple')).toBe(false);
  });

  // E203: Example - sunset theme is in warm family
  it('E203: sunset theme should match "warm" color family', () => {
    const sunsetTheme: ThemeMetadata = {
      id: 'sunset',
      name: 'Sunset',
      description: 'Sunset theme',
      previewColors: {
        primary: '#fb923c',
        background: '#1a1412',
        text: '#fed7aa',
      },
    };

    expect(matchesColorFamily(sunsetTheme, 'warm')).toBe(true);
    expect(matchesColorFamily(sunsetTheme, 'blues')).toBe(false);
    expect(matchesColorFamily(sunsetTheme, 'greens')).toBe(false);
    expect(matchesColorFamily(sunsetTheme, 'purple')).toBe(false);
  });

  // E204: Example - purple-haze is in purple family
  it('E204: purple-haze theme should match "purple" color family', () => {
    const purpleTheme: ThemeMetadata = {
      id: 'purple-haze',
      name: 'Purple Haze',
      description: 'Purple Haze theme',
      previewColors: {
        primary: '#a855f7',
        background: '#1a0a2e',
        text: '#e9d5ff',
      },
    };

    expect(matchesColorFamily(purpleTheme, 'purple')).toBe(true);
    expect(matchesColorFamily(purpleTheme, 'blues')).toBe(false);
    expect(matchesColorFamily(purpleTheme, 'greens')).toBe(false);
    expect(matchesColorFamily(purpleTheme, 'warm')).toBe(false);
  });
});

describe('Integration Tests - Combined Filters', () => {
  // E301: Example - light + blues should return only light
  it('E301: light brightness + blues color should return only light theme', () => {
    const allThemes: ThemeMetadata[] = [
      {
        id: 'light',
        name: 'Light',
        description: 'Light',
        previewColors: {
          primary: '#0ea5e9',
          background: '#f8fafc',
          text: '#1e293b',
        },
      },
      {
        id: 'dark',
        name: 'Dark',
        description: 'Dark',
        previewColors: {
          primary: '#38bdf8',
          background: '#0f172a',
          text: '#e2e8f0',
        },
      },
      {
        id: 'ocean',
        name: 'Ocean',
        description: 'Ocean',
        previewColors: {
          primary: '#06b6d4',
          background: '#0c1821',
          text: '#99f6e4',
        },
      },
    ];

    const result = filterThemes(allThemes, {
      brightness: 'light',
      colorFamily: 'blues',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('light');
  });

  // E302: Example - dark + greens should return forest and mint
  it('E302: dark brightness + greens color should return forest and mint themes', () => {
    const allThemes: ThemeMetadata[] = [
      {
        id: 'light',
        name: 'Light',
        description: 'Light',
        previewColors: {
          primary: '#0ea5e9',
          background: '#f8fafc',
          text: '#1e293b',
        },
      },
      {
        id: 'forest',
        name: 'Forest',
        description: 'Forest',
        previewColors: {
          primary: '#22c55e',
          background: '#0a1f0a',
          text: '#bbf7d0',
        },
      },
      {
        id: 'mint',
        name: 'Mint',
        description: 'Mint',
        previewColors: {
          primary: '#10b981',
          background: '#0a1f14',
          text: '#a7f3d0',
        },
      },
    ];

    const result = filterThemes(allThemes, {
      brightness: 'dark',
      colorFamily: 'greens',
    });

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(['forest', 'mint']);
  });

  // E303: Example - dark + warm should return sunset, ember, amber
  it('E303: dark brightness + warm color should return sunset, ember, amber', () => {
    const allThemes: ThemeMetadata[] = [
      {
        id: 'light',
        name: 'Light',
        description: 'Light',
        previewColors: {
          primary: '#0ea5e9',
          background: '#f8fafc',
          text: '#1e293b',
        },
      },
      {
        id: 'sunset',
        name: 'Sunset',
        description: 'Sunset',
        previewColors: {
          primary: '#fb923c',
          background: '#1a1412',
          text: '#fed7aa',
        },
      },
      {
        id: 'ember',
        name: 'Ember',
        description: 'Ember',
        previewColors: {
          primary: '#ef4444',
          background: '#1a0a0a',
          text: '#fecaca',
        },
      },
      {
        id: 'amber',
        name: 'Amber',
        description: 'Amber',
        previewColors: {
          primary: '#f59e0b',
          background: '#1a1410',
          text: '#fde68a',
        },
      },
    ];

    const result = filterThemes(allThemes, {
      brightness: 'dark',
      colorFamily: 'warm',
    });

    expect(result).toHaveLength(3);
    expect(result.map((t) => t.id)).toEqual(['sunset', 'ember', 'amber']);
  });
});
