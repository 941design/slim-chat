/**
 * HoverInfo Component Tests
 *
 * Tests for the hover info context and components that provide
 * footer-style info text with hysteresis behavior.
 */

import fc from 'fast-check';

// Type for hover info state
interface HoverInfoState {
  currentText: string | null;
  pendingHide: boolean;
}

// Simulate the hover info state management logic
function createHoverInfoState(): {
  state: HoverInfoState;
  showInfo: (text: string) => void;
  hideInfo: () => void;
  cancelHide: () => void;
  triggerHideTimeout: () => void;
} {
  const state: HoverInfoState = {
    currentText: null,
    pendingHide: false,
  };

  return {
    state,
    showInfo: (text: string) => {
      state.pendingHide = false; // Cancel any pending hide
      state.currentText = text;
    },
    hideInfo: () => {
      state.pendingHide = true; // Schedule hide with delay
    },
    cancelHide: () => {
      state.pendingHide = false;
    },
    triggerHideTimeout: () => {
      if (state.pendingHide) {
        state.currentText = null;
        state.pendingHide = false;
      }
    },
  };
}

describe('HoverInfo - State Management (Property-Based)', () => {
  // Arbitrary for non-empty info text
  const arbInfoText = fc.string({ minLength: 1, maxLength: 100 });

  test('P001: showInfo immediately displays text', () => {
    fc.assert(
      fc.property(arbInfoText, (text) => {
        const { state, showInfo } = createHoverInfoState();
        showInfo(text);
        expect(state.currentText).toBe(text);
      })
    );
  });

  test('P002: hideInfo schedules hide (does not immediately clear)', () => {
    fc.assert(
      fc.property(arbInfoText, (text) => {
        const { state, showInfo, hideInfo } = createHoverInfoState();
        showInfo(text);
        hideInfo();
        // Text should still be visible immediately after hideInfo
        expect(state.currentText).toBe(text);
        expect(state.pendingHide).toBe(true);
      })
    );
  });

  test('P003: triggerHideTimeout clears text when pending', () => {
    fc.assert(
      fc.property(arbInfoText, (text) => {
        const { state, showInfo, hideInfo, triggerHideTimeout } = createHoverInfoState();
        showInfo(text);
        hideInfo();
        triggerHideTimeout();
        expect(state.currentText).toBeNull();
        expect(state.pendingHide).toBe(false);
      })
    );
  });

  test('P004: showInfo cancels pending hide (hysteresis)', () => {
    fc.assert(
      fc.property(arbInfoText, arbInfoText, (text1, text2) => {
        const { state, showInfo, hideInfo, triggerHideTimeout } = createHoverInfoState();
        showInfo(text1);
        hideInfo(); // Schedule hide
        showInfo(text2); // Should cancel pending hide
        triggerHideTimeout(); // Should have no effect
        expect(state.currentText).toBe(text2);
      })
    );
  });

  test('P005: cancelHide prevents scheduled hide', () => {
    fc.assert(
      fc.property(arbInfoText, (text) => {
        const { state, showInfo, hideInfo, cancelHide, triggerHideTimeout } = createHoverInfoState();
        showInfo(text);
        hideInfo();
        cancelHide();
        triggerHideTimeout();
        // Text should still be visible because hide was cancelled
        expect(state.currentText).toBe(text);
      })
    );
  });

  test('P006: Initial state has null text', () => {
    const { state } = createHoverInfoState();
    expect(state.currentText).toBeNull();
    expect(state.pendingHide).toBe(false);
  });

  test('P007: Multiple showInfo calls update to latest text', () => {
    fc.assert(
      fc.property(fc.array(arbInfoText, { minLength: 1, maxLength: 10 }), (texts) => {
        const { state, showInfo } = createHoverInfoState();
        texts.forEach((text) => showInfo(text));
        expect(state.currentText).toBe(texts[texts.length - 1]);
      })
    );
  });

  test('P008: triggerHideTimeout without pending hide does nothing', () => {
    fc.assert(
      fc.property(arbInfoText, (text) => {
        const { state, showInfo, triggerHideTimeout } = createHoverInfoState();
        showInfo(text);
        triggerHideTimeout();
        expect(state.currentText).toBe(text);
      })
    );
  });
});

describe('HoverInfo - Hysteresis Behavior (Example-Based)', () => {
  test('E001: Quick hover-out and back in preserves text', () => {
    const { state, showInfo, hideInfo } = createHoverInfoState();

    // Hover over element A
    showInfo('Element A info');
    expect(state.currentText).toBe('Element A info');

    // Mouse leaves (starts hide timer)
    hideInfo();
    expect(state.pendingHide).toBe(true);

    // Mouse enters same element again (before timer fires)
    showInfo('Element A info');
    expect(state.pendingHide).toBe(false);
    expect(state.currentText).toBe('Element A info');
  });

  test('E002: Moving between elements shows new text immediately', () => {
    const { state, showInfo, hideInfo } = createHoverInfoState();

    // Hover over element A
    showInfo('Element A info');
    expect(state.currentText).toBe('Element A info');

    // Mouse leaves A
    hideInfo();

    // Mouse enters element B (before timer fires)
    showInfo('Element B info');
    expect(state.currentText).toBe('Element B info');
    expect(state.pendingHide).toBe(false);
  });

  test('E003: Full hover cycle clears text after delay', () => {
    const { state, showInfo, hideInfo, triggerHideTimeout } = createHoverInfoState();

    showInfo('Hover text');
    expect(state.currentText).toBe('Hover text');

    hideInfo();
    expect(state.currentText).toBe('Hover text'); // Still visible

    triggerHideTimeout(); // Simulates delay elapsed
    expect(state.currentText).toBeNull(); // Now cleared
  });
});

describe('HoverInfo - Info Text Content (Property-Based)', () => {
  test('P009: Info text is stored exactly as provided', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        (text) => {
          const { state, showInfo } = createHoverInfoState();
          showInfo(text);
          expect(state.currentText).toBe(text);
        }
      )
    );
  });

  test('P010: Unicode and special characters are preserved', () => {
    // Test with specific unicode examples since unicodeString is not available
    const unicodeTexts = [
      'Hello \u{1F600}', // Emoji
      '日本語テスト', // Japanese
      'Café résumé', // Accented
      'Test\nwith\nnewlines',
      'Tab\there',
    ];

    unicodeTexts.forEach((text) => {
      const { state, showInfo } = createHoverInfoState();
      showInfo(text);
      expect(state.currentText).toBe(text);
    });
  });
});
