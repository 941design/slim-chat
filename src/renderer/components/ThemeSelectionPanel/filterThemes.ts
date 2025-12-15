/**
 * Theme Filtering Logic
 *
 * Pure functions for filtering theme lists based on user-selected criteria.
 */

import { ThemeMetadata } from '../../themes/definitions';
import { ThemeFilters } from './types';

/**
 * Filter themes based on brightness and color family criteria
 *
 * CONTRACT:
 *   Inputs:
 *     - themes: collection of ThemeMetadata objects, non-empty
 *     - filters: ThemeFilters object containing brightness and colorFamily criteria
 *
 *   Outputs:
 *     - filtered collection of ThemeMetadata objects
 *     - collection size: 0 ≤ output.length ≤ input.length
 *
 *   Invariants:
 *     - When both filters are 'all', output equals input (no filtering)
 *     - Output is subset of input (no new themes added)
 *     - Order preserved: output themes appear in same order as input
 *     - Empty input produces empty output
 *
 *   Properties:
 *     - Identity: filterThemes(themes, {brightness: 'all', colorFamily: 'all'}) equals themes
 *     - Subset: every theme in output exists in input
 *     - Order preservation: for themes A,B in output where A appears before B in input, A appears before B in output
 *     - Commutative filtering: brightness filter then color family filter equals color family then brightness
 *     - Monotonic: more restrictive filters never increase output size
 *
 *   Algorithm:
 *     1. Start with full theme list
 *     2. If brightness filter is not 'all':
 *        a. If 'light': keep only theme with id 'light'
 *        b. If 'dark': keep all themes except 'light'
 *     3. If colorFamily filter is not 'all':
 *        a. If 'blues': keep only themes [light, dark, ocean, twilight]
 *        b. If 'greens': keep only themes [forest, mint]
 *        c. If 'warm': keep only themes [sunset, ember, amber]
 *        d. If 'purple': keep only theme [purple-haze]
 *     4. Return filtered list
 */
export function filterThemes(
  themes: ThemeMetadata[],
  filters: ThemeFilters
): ThemeMetadata[] {
  return themes.filter(
    (theme) =>
      matchesBrightness(theme, filters.brightness) &&
      matchesColorFamily(theme, filters.colorFamily)
  );
}

/**
 * Check if theme matches brightness filter
 *
 * CONTRACT:
 *   Inputs:
 *     - theme: ThemeMetadata object
 *     - filter: BrightnessFilter value ('all', 'light', or 'dark')
 *
 *   Outputs:
 *     - boolean: true if theme matches filter criteria
 *
 *   Invariants:
 *     - filter 'all' always returns true
 *     - filter 'light' returns true only for theme.id === 'light'
 *     - filter 'dark' returns true for all themes except 'light'
 *
 *   Properties:
 *     - Identity: matchesBrightness(theme, 'all') equals true for all themes
 *     - Exclusivity: for any theme, exactly one of [matchesBrightness(t, 'light'), matchesBrightness(t, 'dark')] is true
 *     - Deterministic: same theme and filter always produce same result
 */
export function matchesBrightness(
  theme: ThemeMetadata,
  filter: 'all' | 'light' | 'dark'
): boolean {
  if (filter === 'all') return true;
  if (filter === 'light') return theme.id === 'light';
  return theme.id !== 'light';
}

/**
 * Check if theme matches color family filter
 *
 * CONTRACT:
 *   Inputs:
 *     - theme: ThemeMetadata object
 *     - filter: ColorFamilyFilter value ('all', 'blues', 'greens', 'warm', 'purple')
 *
 *   Outputs:
 *     - boolean: true if theme matches filter criteria
 *
 *   Invariants:
 *     - filter 'all' always returns true
 *     - filter 'blues': true for [light, dark, ocean, twilight]
 *     - filter 'greens': true for [forest, mint]
 *     - filter 'warm': true for [sunset, ember, amber]
 *     - filter 'purple': true for [purple-haze]
 *     - Each theme belongs to exactly one color family
 *
 *   Properties:
 *     - Identity: matchesColorFamily(theme, 'all') equals true for all themes
 *     - Coverage: for any theme, exactly one of [blues, greens, warm, purple] returns true
 *     - Deterministic: same theme and filter always produce same result
 */
export function matchesColorFamily(
  theme: ThemeMetadata,
  filter: 'all' | 'blues' | 'greens' | 'warm' | 'purple'
): boolean {
  if (filter === 'all') return true;

  const colorFamilies = {
    blues: ['light', 'dark', 'ocean', 'twilight'],
    greens: ['forest', 'mint'],
    warm: ['sunset', 'ember', 'amber'],
    purple: ['purple-haze'],
  };

  return colorFamilies[filter].includes(theme.id);
}
