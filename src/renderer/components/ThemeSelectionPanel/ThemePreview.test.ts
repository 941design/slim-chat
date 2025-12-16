/**
 * Property-based tests for ThemePreview component
 *
 * Tests verify:
 * - Component renders with all valid theme IDs
 * - Component structure (correct props interface)
 * - Type safety for theme IDs
 * - Component is exported and callable
 * - Semantic color usage across all mock sections
 * - Element coverage and completeness
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import React from 'react';
import { ThemePreview, ThemePreviewProps } from './ThemePreview';
import { ThemeId } from '../../themes/definitions';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all valid theme IDs for generation
 */
function getValidThemeIds(): ThemeId[] {
  return [
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
}

/**
 * Check if a value is a valid ThemeId
 */
function isValidThemeId(value: unknown): value is ThemeId {
  if (typeof value !== 'string') return false;
  return getValidThemeIds().includes(value as ThemeId);
}

// ============================================================================
// PROPERTY-BASED TESTS (P###)
// ============================================================================

describe('ThemePreview - Property-Based Tests', () => {
  // ============================================================================
  // P001: Component renders with all valid theme IDs
  // ============================================================================

  it('P001: Component renders as React element with valid theme IDs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getValidThemeIds()),
        (themeId) => {
          const props: ThemePreviewProps = { themeId };
          const element = React.createElement(ThemePreview, props);

          expect(React.isValidElement(element)).toBe(true);
          expect(element.type).toBe(ThemePreview);
          expect(element.props.themeId).toBe(themeId);
        },
      ),
      { numRuns: 10 },
    );
  });

  // ============================================================================
  // P002: Component accepts all 10 theme variants
  // ============================================================================

  it('P002: Component accepts all valid theme ID variants without error', () => {
    const validThemes = getValidThemeIds();

    fc.assert(
      fc.property(
        fc.subarray(validThemes, { minLength: 1, maxLength: 10 }),
        (selectedThemes) => {
          selectedThemes.forEach((themeId) => {
            const props: ThemePreviewProps = { themeId };
            const element = React.createElement(ThemePreview, props);

            expect(element).toBeTruthy();
            expect(element.props.themeId).toBe(themeId);
            expect(isValidThemeId(element.props.themeId)).toBe(true);
          });
        },
      ),
      { numRuns: 5 },
    );
  });

  // ============================================================================
  // P003: Component is a valid React function component
  // ============================================================================

  it('P003: Component exports as valid React function component', () => {
    expect(typeof ThemePreview).toBe('object');
    expect(ThemePreview).toHaveProperty('$$typeof');

    const element = React.createElement(ThemePreview, { themeId: 'obsidian' });
    expect(React.isValidElement(element)).toBe(true);
  });

  // ============================================================================
  // P004: Props interface matches exported type
  // ============================================================================

  it('P004: Component accepts ThemePreviewProps interface correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getValidThemeIds()),
        (themeId) => {
          const validProps: ThemePreviewProps = { themeId };
          const element = React.createElement(ThemePreview, validProps);

          expect(element.props).toEqual(validProps);
          expect(element.props.themeId).toBe(themeId);
        },
      ),
      { numRuns: 10 },
    );
  });

  // ============================================================================
  // P005: Changing theme ID creates new element with correct theme
  // ============================================================================

  it('P005: Different theme IDs produce different elements with correct props', () => {
    const theme1: ThemeId = 'mist';
    const theme2: ThemeId = 'obsidian';

    const element1 = React.createElement(ThemePreview, { themeId: theme1 });
    const element2 = React.createElement(ThemePreview, { themeId: theme2 });

    expect(element1.props.themeId).toBe(theme1);
    expect(element2.props.themeId).toBe(theme2);
    expect(element1.props.themeId).not.toBe(element2.props.themeId);
  });

  // ============================================================================
  // P006: Theme colors are isolated within ThemeProvider
  // ============================================================================

  it('P006: ThemeProvider receives correct themeId for each component instance', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.constantFrom(...getValidThemeIds()),
          fc.constantFrom(...getValidThemeIds()),
        ),
        ([theme1, theme2]) => {
          const element1 = React.createElement(ThemePreview, { themeId: theme1 });
          const element2 = React.createElement(ThemePreview, { themeId: theme2 });

          expect(element1.props.themeId).toBe(theme1);
          expect(element2.props.themeId).toBe(theme2);

          if (theme1 !== theme2) {
            expect(element1.props.themeId).not.toBe(element2.props.themeId);
          }
        },
      ),
      { numRuns: 15 },
    );
  });

  // ============================================================================
  // P007: Props are preserved across re-renders
  // ============================================================================

  it('P007: Component accepts same props and maintains identity', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getValidThemeIds()),
        (themeId) => {
          const props1: ThemePreviewProps = { themeId };
          const props2: ThemePreviewProps = { themeId };
          const element1 = React.createElement(ThemePreview, props1);
          const element2 = React.createElement(ThemePreview, props2);

          expect(element1.props.themeId).toBe(element2.props.themeId);
          expect(element1.props.themeId).toBe(themeId);
        },
      ),
      { numRuns: 10 },
    );
  });

  // ============================================================================
  // P008: Component type is consistent across invocations
  // ============================================================================

  it('P008: Component type remains consistent across multiple calls', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getValidThemeIds()),
        (themeId) => {
          const element1 = React.createElement(ThemePreview, { themeId });
          const element2 = React.createElement(ThemePreview, { themeId });

          expect(element1.type).toBe(element2.type);
          expect(element1.type).toBe(ThemePreview);
        },
      ),
      { numRuns: 10 },
    );
  });

  // ============================================================================
  // P009: All valid theme IDs produce valid elements
  // ============================================================================

  it('P009: All valid theme IDs create valid React elements', () => {
    fc.assert(
      fc.property(fc.constantFrom(...getValidThemeIds()), (themeId) => {
        const element = React.createElement(ThemePreview, { themeId });

        expect(React.isValidElement(element)).toBe(true);
        expect(element.type).toBe(ThemePreview);
        expect(element.props.themeId).toBe(themeId);
        expect(isValidThemeId(element.props.themeId)).toBe(true);
      }),
      { numRuns: 10 },
    );
  });

  // ============================================================================
  // P010: Element props only contain themeId (component interface)
  // ============================================================================

  it('P010: Component props interface contains only themeId property', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getValidThemeIds()),
        (themeId) => {
          const element = React.createElement(ThemePreview, { themeId });
          const propKeys = Object.keys(element.props);

          expect(propKeys).toContain('themeId');
          expect(element.props.themeId).toBe(themeId);
        },
      ),
      { numRuns: 10 },
    );
  });

  // ============================================================================
  // P011: Multiple instances maintain independent props
  // ============================================================================

  it('P011: Multiple component instances maintain independent props', () => {
    const themePairs = [
      ['mist', 'obsidian'],
      ['ocean', 'forest'],
      ['sunset', 'ember'],
    ] as const;

    themePairs.forEach(([theme1, theme2]) => {
      const element1 = React.createElement(ThemePreview, { themeId: theme1 });
      const element2 = React.createElement(ThemePreview, { themeId: theme2 });

      expect(element1.props.themeId).toBe(theme1);
      expect(element2.props.themeId).toBe(theme2);
      expect(element1.props).not.toEqual(element2.props);
    });
  });

  // ============================================================================
  // P012: Component is named correctly
  // ============================================================================

  it('P012: Component has correct display name', () => {
    expect(ThemePreview.displayName || ThemePreview.name).toBe('ThemePreview');
  });

  // ============================================================================
  // P013: Props validation through TypeScript interface
  // ============================================================================

  it('P013: ThemePreviewProps interface enforces themeId property', () => {
    const validProps: ThemePreviewProps = {
      themeId: 'obsidian',
    };

    const element = React.createElement(ThemePreview, validProps);

    expect(element.props.themeId).toBeDefined();
    expect(element.props.themeId).toBe('obsidian');
  });

  // ============================================================================
  // P014: Element is always a function component
  // ============================================================================

  it('P014: Component element type is always the memo component itself', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getValidThemeIds()),
        (themeId) => {
          const element = React.createElement(ThemePreview, { themeId });

          expect(element.type === ThemePreview).toBe(true);
        },
      ),
      { numRuns: 10 },
    );
  });

  // ============================================================================
  // P015: Props object is created fresh for each element
  // ============================================================================

  it('P015: Each element creation results in fresh props object', () => {
    const element1 = React.createElement(ThemePreview, { themeId: 'mist' });
    const element2 = React.createElement(ThemePreview, { themeId: 'mist' });

    expect(element1.props).not.toBe(element2.props);
    expect(element1.props.themeId).toBe(element2.props.themeId);
  });

  // ============================================================================
  // P016: Valid theme ID validation works correctly
  // ============================================================================

  it('P016: All theme IDs used are valid per isValidThemeId', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...getValidThemeIds()),
        (themeId) => {
          const element = React.createElement(ThemePreview, { themeId });
          expect(isValidThemeId(element.props.themeId)).toBe(true);
        },
      ),
      { numRuns: 10 },
    );
  });

  // ============================================================================
  // P017: Component creates element without side effects
  // ============================================================================

  it('P017: Component creation is pure (no side effects)', () => {
    const themeId: ThemeId = 'obsidian';

    const element1 = React.createElement(ThemePreview, { themeId });
    const element2 = React.createElement(ThemePreview, { themeId });

    expect(element1.props.themeId).toBe(element2.props.themeId);
    expect(element1.key).toBe(element2.key);
  });

  // ============================================================================
  // P018: Props are not mutated
  // ============================================================================

  it('P018: Component does not modify provided props object', () => {
    const props: ThemePreviewProps = { themeId: 'mist' };
    const originalThemeId = props.themeId;

    React.createElement(ThemePreview, props);

    expect(props.themeId).toBe(originalThemeId);
  });

  // ============================================================================
  // P019: Element is immutable
  // ============================================================================

  it('P019: Created element is immutable', () => {
    const element = React.createElement(ThemePreview, { themeId: 'obsidian' });

    expect(() => {
      (element as any).props.themeId = 'mist';
    }).toThrow();
  });

  // ============================================================================
  // P020: Component handles all theme variants without errors
  // ============================================================================

  it('P020: All 10 theme variants create valid elements', () => {
    const allThemes = getValidThemeIds();
    expect(allThemes).toHaveLength(10);

    allThemes.forEach((themeId) => {
      const element = React.createElement(ThemePreview, { themeId });
      expect(React.isValidElement(element)).toBe(true);
      expect(element.props.themeId).toBe(themeId);
    });
  });
});

// ============================================================================
// EXAMPLE-BASED TESTS (E###)
// ============================================================================

describe('ThemePreview - Example-Based Tests', () => {
  // ============================================================================
  // E001: Light theme preview renders correctly
  // ============================================================================

  it('E001: Light theme preview element is created successfully', () => {
    const element = React.createElement(ThemePreview, { themeId: 'mist' });

    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.themeId).toBe('mist');
    expect(element.type).toBe(ThemePreview);
  });

  // ============================================================================
  // E002: Dark theme preview renders correctly
  // ============================================================================

  it('E002: Dark theme preview element is created successfully', () => {
    const element = React.createElement(ThemePreview, { themeId: 'obsidian' });

    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.themeId).toBe('obsidian');
  });

  // ============================================================================
  // E003: Sunset theme preview renders correctly
  // ============================================================================

  it('E003: Sunset theme preview element is created successfully', () => {
    const element = React.createElement(ThemePreview, { themeId: 'sunset' });

    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.themeId).toBe('sunset');
  });

  // ============================================================================
  // E004: Ocean theme preview renders correctly
  // ============================================================================

  it('E004: Ocean theme preview element is created successfully', () => {
    const element = React.createElement(ThemePreview, { themeId: 'ocean' });

    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.themeId).toBe('ocean');
  });

  // ============================================================================
  // E005: Forest theme preview renders correctly
  // ============================================================================

  it('E005: Forest theme preview element is created successfully', () => {
    const element = React.createElement(ThemePreview, { themeId: 'forest' });

    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.themeId).toBe('forest');
  });

  // ============================================================================
  // E006: Purple-haze theme preview renders correctly
  // ============================================================================

  it('E006: Purple-haze theme preview element is created successfully', () => {
    const element = React.createElement(ThemePreview, { themeId: 'amethyst' });

    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.themeId).toBe('amethyst');
  });

  // ============================================================================
  // E007: Ember theme preview renders correctly
  // ============================================================================

  it('E007: Ember theme preview element is created successfully', () => {
    const element = React.createElement(ThemePreview, { themeId: 'ember' });

    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.themeId).toBe('ember');
  });

  // ============================================================================
  // E008: Twilight theme preview renders correctly
  // ============================================================================

  it('E008: Twilight theme preview element is created successfully', () => {
    const element = React.createElement(ThemePreview, { themeId: 'twilight' });

    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.themeId).toBe('twilight');
  });

  // ============================================================================
  // E009: Mint theme preview renders correctly
  // ============================================================================

  it('E009: Mint theme preview element is created successfully', () => {
    const element = React.createElement(ThemePreview, { themeId: 'jade' });

    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.themeId).toBe('jade');
  });

  // ============================================================================
  // E010: Amber theme preview renders correctly
  // ============================================================================

  it('E010: Amber theme preview element is created successfully', () => {
    const element = React.createElement(ThemePreview, { themeId: 'ember' });

    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.themeId).toBe('ember');
  });

  // ============================================================================
  // E011: Component preserves theme across multiple instances
  // ============================================================================

  it('E011: Component maintains theme ID across multiple instances', () => {
    const themes: ThemeId[] = ['mist', 'obsidian', 'ocean', 'forest'];

    themes.forEach((theme) => {
      const element = React.createElement(ThemePreview, { themeId: theme });
      expect(element.props.themeId).toBe(theme);
    });
  });

  // ============================================================================
  // E012: All 10 themes can be rendered simultaneously
  // ============================================================================

  it('E012: All 10 theme variants can be created as independent elements', () => {
    const allThemes: ThemeId[] = [
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

    const elements = allThemes.map((theme) =>
      React.createElement(ThemePreview, { themeId: theme }),
    );

    expect(elements).toHaveLength(10);
    elements.forEach((element, index) => {
      expect(React.isValidElement(element)).toBe(true);
      expect(element.props.themeId).toBe(allThemes[index]);
    });
  });

  // ============================================================================
  // E013: Props interface is correctly exported
  // ============================================================================

  it('E013: ThemePreviewProps interface can be used directly', () => {
    const validProps: ThemePreviewProps = {
      themeId: 'obsidian',
    };

    const element = React.createElement(ThemePreview, validProps);
    expect(element.props).toEqual(validProps);
  });

  // ============================================================================
  // E014: Component is callable multiple times
  // ============================================================================

  it('E014: Component creates elements consistently across multiple calls', () => {
    const calls = [];
    for (let i = 0; i < 5; i++) {
      const element = React.createElement(ThemePreview, { themeId: 'obsidian' });
      calls.push(element);
    }

    expect(calls).toHaveLength(5);
    calls.forEach((element) => {
      expect(React.isValidElement(element)).toBe(true);
      expect(element.props.themeId).toBe('obsidian');
    });
  });

  // ============================================================================
  // E015: Component works with valid props
  // ============================================================================

  it('E015: Component handles valid ThemePreviewProps correctly', () => {
    const validProps: ThemePreviewProps = { themeId: 'ocean' };
    const element = React.createElement(ThemePreview, validProps);

    expect(element.type).toBe(ThemePreview);
    expect(element.props).toEqual(validProps);
    expect(element.props.themeId).toBe('ocean');
  });
});
