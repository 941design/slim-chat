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

describe('Theme System Integration: Core Properties', () => {
  it('Property: createThemeSystem always returns valid Chakra system for valid theme IDs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ThemeId>(
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
        ),
        (themeId: ThemeId) => {
          const system = createThemeSystem(themeId);

          expect(system).toBeDefined();
          expect(typeof system).toBe('object');
          expect(system).toHaveProperty('_config');
        }
      )
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
      )
    );
  });

  it('Property: Invalid theme IDs fall back to dark theme', () => {
    const originalWarn = console.warn;
    console.warn = () => {}; // Suppress expected warnings during test
    try {
      fc.assert(
        fc.property(
          // Use representative invalid theme IDs instead of random strings
          fc.constantFrom('invalid', 'DARK', 'Light', 'unknown-theme', '', ' '),
          (invalidThemeId: string) => {
            const systemWithInvalid = createThemeSystem(invalidThemeId);
            const systemWithDark = createThemeSystem('dark');

            expect(systemWithInvalid._config).toEqual(systemWithDark._config);
          }
        )
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  it('Property: Null/undefined theme IDs fall back to dark theme', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null as null | undefined, undefined),
        (nullishThemeId: null | undefined) => {
          const systemWithNullish = createThemeSystem(nullishThemeId);
          const systemWithDark = createThemeSystem('dark');

          expect(systemWithNullish._config).toEqual(systemWithDark._config);
        }
      )
    );
  });
});

describe('Theme System Integration: Identity Resolution', () => {
  it('Property: Null identity returns dark theme', () => {
    const themeId = getThemeIdForIdentity(null);
    expect(themeId).toBe('dark');
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
          expect(themeId).toBe('dark');
        }
      )
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
          expect(themeId).toBe('dark');
        }
      )
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
            ),
          })
          .filter((identity: any) => isValidThemeId(identity.theme)),
        (identity: any) => {
          const themeId = getThemeIdForIdentity(identity as NostlingIdentity);
          expect(themeId).toBe(identity.theme);
          expect(isValidThemeId(themeId)).toBe(true);
        }
      )
    );
  });
});

describe('Theme System Integration: Theme Switching', () => {
  it('Property: Switching between any two themes produces valid systems', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.constantFrom<ThemeId>(
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
          ),
          fc.constantFrom<ThemeId>(
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
      )
    );
  });

  it('Property: Theme system is deterministic (same theme = same system)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ThemeId>(
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
        ),
        (themeId: ThemeId) => {
          const system1 = createThemeSystem(themeId);
          const system2 = createThemeSystem(themeId);

          expect(system1._config).toEqual(system2._config);
        }
      )
    );
  });
});

describe('Theme System Integration: Metadata Consistency', () => {
  it('Property: Theme metadata ID matches theme config', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ThemeId>(
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
        ),
        (themeId: ThemeId) => {
          const themeDef = getTheme(themeId);

          expect(themeDef.metadata.id).toBe(themeId);
          expect(themeDef.config).toBeDefined();
          expect(typeof themeDef.config).toBe('object');
        }
      )
    );
  });

  it('Property: All themes have preview colors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ThemeId>(
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
        ),
        (themeId: ThemeId) => {
          const themeDef = getTheme(themeId);

          expect(themeDef.metadata.previewColors).toBeDefined();
          expect(themeDef.metadata.previewColors.primary).toMatch(/^#[0-9a-f]{6}$/i);
          expect(themeDef.metadata.previewColors.background).toMatch(/^#[0-9a-f]{6}$/i);
          expect(themeDef.metadata.previewColors.text).toMatch(/^#[0-9a-f]{6}$/i);
        }
      )
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
      )
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
            ),
          }),
          fc.record({
            id: fc.constant('identity-2'),
            npub: fc.string(),
            label: fc.string(),
            createdAt: fc.string(),
            theme: fc.constantFrom<ThemeId>(
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
      )
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
          ),
        }),
        (identity: any) => {
          const noIdentityTheme = getThemeIdForIdentity(null);
          expect(noIdentityTheme).toBe('dark');

          const withIdentityTheme = getThemeIdForIdentity(identity as NostlingIdentity);
          expect(withIdentityTheme).toBe(identity.theme);

          const backToNoIdentityTheme = getThemeIdForIdentity(null);
          expect(backToNoIdentityTheme).toBe('dark');
          expect(backToNoIdentityTheme).toBe(noIdentityTheme);
        }
      )
    );
  });
});

describe('Theme System Integration: Fallback Consistency', () => {
  it('Property: All fallback scenarios produce dark theme', () => {
    const originalWarn = console.warn;
    console.warn = () => {}; // Suppress expected warnings during test
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

            const darkSystem = createThemeSystem('dark');
            expect(system._config).toEqual(darkSystem._config);
          }
        )
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});
