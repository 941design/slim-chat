/**
 * Theme System Integration Tests
 *
 * Property-based tests verifying complete theme system workflows:
 * - Theme persistence and retrieval
 * - Theme application on identity selection
 * - Invalid theme fallback behavior
 * - Theme switching across identities
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { createThemeSystem, getThemeIdForIdentity } from './useTheme';
import { getTheme, isValidThemeId, type ThemeId } from './definitions';
import { NostlingIdentity } from '../../shared/types';

// Reduced iterations since createThemeSystem() is expensive (~200ms per call)
// and we're testing a small finite set of themes (10 total)
const fcOptions = { numRuns: 10 };

describe('Theme System Integration: Core Properties', () => {
  it('Property: createThemeSystem always returns valid Chakra system for valid theme IDs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ThemeId>(
          'mist',
          'obsidian',
          'sunset',
          'ocean',
          'forest',
          'amethyst',
          'ember',
          'twilight',
          'jade',
          'ember'
        ),
        (themeId: ThemeId) => {
          const system = createThemeSystem(themeId);

          expect(system).toBeDefined();
          expect(typeof system).toBe('object');
          expect(system).toHaveProperty('_config');
        }
      ),
      fcOptions
    );
  });

  it('Property: createThemeSystem handles null/undefined gracefully', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null as null | undefined, undefined),
        (themeId: null | undefined) => {
          const system = createThemeSystem(themeId);

          expect(system).toBeDefined();
          expect(typeof system).toBe('object');
          expect(system).toHaveProperty('_config');
        }
      ),
      fcOptions
    );
  });

  it('Property: Invalid theme IDs fall back to dark theme', () => {
    const originalWarn = console.warn;
    console.warn = () => {}; // Suppress expected warnings during test
    // Cache the dark system once to avoid redundant expensive calls
    const darkSystem = createThemeSystem('obsidian');
    try {
      fc.assert(
        fc.property(
          // Use representative invalid theme IDs instead of random strings
          fc.constantFrom('invalid', 'DARK', 'Light', 'unknown-theme', '', ' '),
          (invalidThemeId: string) => {
            const systemWithInvalid = createThemeSystem(invalidThemeId);

            expect(systemWithInvalid._config).toEqual(darkSystem._config);
          }
        ),
        fcOptions
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  it('Property: Null/undefined theme IDs fall back to dark theme', () => {
    // Cache the dark system once to avoid redundant expensive calls
    const darkSystem = createThemeSystem('obsidian');
    fc.assert(
      fc.property(
        fc.constantFrom(null as null | undefined, undefined),
        (nullishThemeId: null | undefined) => {
          const systemWithNullish = createThemeSystem(nullishThemeId);

          expect(systemWithNullish._config).toEqual(darkSystem._config);
        }
      ),
      fcOptions
    );
  });
});

describe('Theme System Integration: Identity Resolution', () => {
  it('Property: Null identity returns dark theme', () => {
    const themeId = getThemeIdForIdentity(null);
    expect(themeId).toBe('obsidian');
  });

  it('Property: Identity without theme field returns dark theme', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string(),
          npub: fc.string(),
          label: fc.string(),
          createdAt: fc.string(),
        }),
        (identity: any) => {
          const themeId = getThemeIdForIdentity(identity as NostlingIdentity);
          expect(themeId).toBe('obsidian');
        }
      ),
      fcOptions
    );
  });

  it('Property: Identity with invalid theme returns dark theme', () => {
    const originalWarn = console.warn;
    console.warn = () => {}; // Suppress expected warnings during test
    try {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.constant('test-id'),
            npub: fc.constant('npub1test'),
            label: fc.constant('Test'),
            createdAt: fc.constant('2024-01-01'),
            // Use representative invalid theme IDs instead of random strings
            theme: fc.constantFrom('invalid', 'DARK', 'Light', 'unknown-theme', '', ' '),
          }),
          (identity: any) => {
            const themeId = getThemeIdForIdentity(identity as NostlingIdentity);
            expect(themeId).toBe('obsidian');
          }
        ),
        fcOptions
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  it('Property: Identity with valid theme returns that theme', () => {
    fc.assert(
      fc.property(
        fc
          .record({
            id: fc.string(),
            npub: fc.string(),
            label: fc.string(),
            createdAt: fc.string(),
            theme: fc.constantFrom<ThemeId>(
              'mist',
              'obsidian',
              'sunset',
              'ocean',
              'forest',
              'amethyst',
              'ember',
              'twilight',
              'jade',
              'ember'
            ),
          })
          .filter((identity: any) => isValidThemeId(identity.theme)),
        (identity: any) => {
          const themeId = getThemeIdForIdentity(identity as NostlingIdentity);
          expect(themeId).toBe(identity.theme);
          expect(isValidThemeId(themeId)).toBe(true);
        }
      ),
      fcOptions
    );
  });
});

describe('Theme System Integration: Theme Switching', () => {
  it('Property: Switching between any two themes produces valid systems', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.constantFrom<ThemeId>(
            'mist',
            'obsidian',
            'sunset',
            'ocean',
            'forest',
            'amethyst',
            'ember',
            'twilight',
            'jade',
            'ember'
          ),
          fc.constantFrom<ThemeId>(
            'mist',
            'obsidian',
            'sunset',
            'ocean',
            'forest',
            'amethyst',
            'ember',
            'twilight',
            'jade',
            'ember'
          )
        ),
        ([themeA, themeB]: [ThemeId, ThemeId]) => {
          const systemA = createThemeSystem(themeA);
          const systemB = createThemeSystem(themeB);

          // Both systems must always be valid regardless of theme choice
          expect(systemA).toBeDefined();
          expect(systemB).toBeDefined();
          expect(systemA).toHaveProperty('_config');
          expect(systemB).toHaveProperty('_config');
        }
      ),
      fcOptions
    );
  });

  it('Property: Theme system is deterministic (same theme = same system)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ThemeId>(
          'mist',
          'obsidian',
          'sunset',
          'ocean',
          'forest',
          'amethyst',
          'ember',
          'twilight',
          'jade',
          'ember'
        ),
        (themeId: ThemeId) => {
          const system1 = createThemeSystem(themeId);
          const system2 = createThemeSystem(themeId);

          expect(system1._config).toEqual(system2._config);
        }
      ),
      fcOptions
    );
  });
});

describe('Theme System Integration: Metadata Consistency', () => {
  it('Property: Theme metadata ID matches theme config', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ThemeId>(
          'mist',
          'obsidian',
          'sunset',
          'ocean',
          'forest',
          'amethyst',
          'ember',
          'twilight',
          'jade',
          'ember'
        ),
        (themeId: ThemeId) => {
          const themeDef = getTheme(themeId);

          expect(themeDef.metadata.id).toBe(themeId);
          expect(themeDef.config).toBeDefined();
          expect(typeof themeDef.config).toBe('object');
        }
      ),
      fcOptions
    );
  });

  it('Property: All themes have preview colors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ThemeId>(
          'mist',
          'obsidian',
          'sunset',
          'ocean',
          'forest',
          'amethyst',
          'ember',
          'twilight',
          'jade',
          'ember'
        ),
        (themeId: ThemeId) => {
          const themeDef = getTheme(themeId);

          expect(themeDef.metadata.previewColors).toBeDefined();
          expect(themeDef.metadata.previewColors.primary).toMatch(/^#[0-9a-f]{6}$/i);
          expect(themeDef.metadata.previewColors.background).toMatch(/^#[0-9a-f]{6}$/i);
          expect(themeDef.metadata.previewColors.text).toMatch(/^#[0-9a-f]{6}$/i);
        }
      ),
      fcOptions
    );
  });
});

describe('Theme System Integration: Complete Workflow', () => {
  it('Property: Identity creation → theme application workflow', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string(),
          npub: fc.string(),
          label: fc.string(),
          createdAt: fc.string(),
          theme: fc.constantFrom<ThemeId>(
            'mist',
            'obsidian',
            'sunset',
            'ocean',
            'forest',
            'amethyst',
            'ember',
            'twilight',
            'jade',
            'ember'
          ),
        }),
        (identity: any) => {
          const themeId = getThemeIdForIdentity(identity as NostlingIdentity);
          expect(themeId).toBe(identity.theme);

          const system = createThemeSystem(themeId);
          expect(system).toBeDefined();

          const themeDef = getTheme(themeId);
          expect(themeDef.metadata.id).toBe(themeId);
        }
      ),
      fcOptions
    );
  });

  it('Property: Theme switching between identities', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.record({
            id: fc.constant('identity-1'),
            npub: fc.string(),
            label: fc.string(),
            createdAt: fc.string(),
            theme: fc.constantFrom<ThemeId>(
              'mist',
              'obsidian',
              'sunset',
              'ocean',
              'forest',
              'amethyst',
              'ember',
              'twilight',
              'jade',
              'ember'
            ),
          }),
          fc.record({
            id: fc.constant('identity-2'),
            npub: fc.string(),
            label: fc.string(),
            createdAt: fc.string(),
            theme: fc.constantFrom<ThemeId>(
              'mist',
              'obsidian',
              'sunset',
              'ocean',
              'forest',
              'amethyst',
              'ember',
              'twilight',
              'jade',
              'ember'
            ),
          })
        ),
        ([identity1, identity2]: [any, any]) => {
          const theme1 = getThemeIdForIdentity(identity1 as NostlingIdentity);
          const theme2 = getThemeIdForIdentity(identity2 as NostlingIdentity);
          const system1 = createThemeSystem(theme1);
          const system2 = createThemeSystem(theme2);

          // Systems must always be valid
          expect(system1).toBeDefined();
          expect(system2).toBeDefined();

          // Themes must match identity preferences
          expect(theme1).toBe(identity1.theme);
          expect(theme2).toBe(identity2.theme);
        }
      ),
      fcOptions
    );
  });

  it('Property: No identity → identity with theme → no identity workflow', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string(),
          npub: fc.string(),
          label: fc.string(),
          createdAt: fc.string(),
          theme: fc.constantFrom<ThemeId>(
            'mist',
            'obsidian',
            'sunset',
            'ocean',
            'forest',
            'amethyst',
            'ember',
            'twilight',
            'jade',
            'ember'
          ),
        }),
        (identity: any) => {
          const noIdentityTheme = getThemeIdForIdentity(null);
          expect(noIdentityTheme).toBe('obsidian');

          const withIdentityTheme = getThemeIdForIdentity(identity as NostlingIdentity);
          expect(withIdentityTheme).toBe(identity.theme);

          const backToNoIdentityTheme = getThemeIdForIdentity(null);
          expect(backToNoIdentityTheme).toBe('obsidian');
          expect(backToNoIdentityTheme).toBe(noIdentityTheme);
        }
      ),
      fcOptions
    );
  });
});

describe('Theme System Integration: Fallback Consistency', () => {
  it('Property: All fallback scenarios produce dark theme', () => {
    const originalWarn = console.warn;
    console.warn = () => {}; // Suppress expected warnings during test
    // Cache the dark system once to avoid redundant expensive calls
    const darkSystem = createThemeSystem('obsidian');
    try {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            // Use representative invalid theme IDs instead of random strings
            fc.constantFrom('invalid', 'DARK', 'Light', 'unknown-theme', '', ' '),
            fc.record({
              id: fc.constant('test-id'),
              npub: fc.constant('npub1test'),
              label: fc.constant('Test'),
              createdAt: fc.constant('2024-01-01'),
            }),
            fc.record({
              id: fc.constant('test-id'),
              npub: fc.constant('npub1test'),
              label: fc.constant('Test'),
              createdAt: fc.constant('2024-01-01'),
              // Use representative invalid theme IDs instead of random strings
              theme: fc.constantFrom('invalid', 'DARK', 'Light', 'unknown-theme', '', ' '),
            })
          ),
          (input: any) => {
            let system;
            if (input === null || input === undefined || typeof input === 'string') {
              system = createThemeSystem(input);
            } else {
              const themeId = getThemeIdForIdentity(input as NostlingIdentity);
              system = createThemeSystem(themeId);
            }

            expect(system._config).toEqual(darkSystem._config);
          }
        ),
        fcOptions
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});
