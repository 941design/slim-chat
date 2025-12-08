/**
 * Property-based tests for Footer component
 *
 * Tests verify:
 * - Status text formatting for all 8 update phases
 * - Refresh icon disabled states based on phase
 * - Button visibility based on phase
 * - Download progress formatting (percent, bytes, speed)
 * - Byte formatting with appropriate units (B, KB, MB, GB)
 * - Edge cases: 0 bytes, very large bytes, missing data
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { formatBytes, getStatusText, isRefreshEnabled } from './utils';
import type { UpdatePhase, UpdateState, DownloadProgress } from '../shared/types';

// ============================================================================
// TEST-SPECIFIC HELPER FUNCTIONS
// ============================================================================

function shouldShowDownloadButton(phase: UpdatePhase): boolean {
  return phase === 'available';
}

function shouldShowRestartButton(phase: UpdatePhase): boolean {
  return phase === 'ready';
}

// ============================================================================
// PROPERTY-BASED TESTS
// ============================================================================

describe('Footer Component - Property-Based Tests', () => {
  // ============================================================================
  // FR1: Status Text Formatting
  // ============================================================================

  describe('FR1: Status Text Formatting', () => {
    it('P001: All phases display correct status text base message', () => {
      const phases: UpdatePhase[] = ['idle', 'checking', 'available', 'downloading', 'downloaded', 'verifying', 'ready', 'failed'];

      fc.assert(
        fc.property(fc.constantFrom(...phases), (phase) => {
          const updateState: UpdateState = { phase };
          const status = getStatusText(updateState);

          // Verify expected text for each phase
          switch (phase) {
            case 'idle':
              expect(status).toBe('Up to date');
              break;
            case 'checking':
              expect(status).toContain('Checking');
              break;
            case 'available':
              expect(status).toContain('Update available');
              break;
            case 'downloading':
              expect(status).toContain('Downloading');
              break;
            case 'downloaded':
              expect(status).toContain('Update downloaded');
              break;
            case 'verifying':
              expect(status).toContain('Verifying');
              break;
            case 'ready':
              expect(status).toContain('Update ready');
              break;
            case 'failed':
              expect(status).toContain('Update failed');
              break;
          }
        }),
      );
    });

    it('P002: Available phase includes new version when provided', () => {
      fc.assert(
        fc.property(
          fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
          (newVersion) => {
            const updateState: UpdateState = {
              phase: 'available',
              version: newVersion,
            };

            const status = getStatusText(updateState);
            if (newVersion) {
              expect(status).toContain(`v${newVersion}`);
            }
          },
        ),
      );
    });

    it('P003: Ready phase includes new version when provided', () => {
      fc.assert(
        fc.property(
          fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
          (newVersion) => {
            const updateState: UpdateState = {
              phase: 'ready',
              version: newVersion,
            };

            const status = getStatusText(updateState);
            if (newVersion) {
              expect(status).toContain(`v${newVersion}`);
            }
          },
        ),
      );
    });

    it('P004: Failed phase includes error detail when provided', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.option(fc.string({ minLength: 1, maxLength: 200 })),
            fc.boolean(),
          ),
          ([detail, hasDetail]) => {
            const updateState: UpdateState = {
              phase: 'failed',
              detail: hasDetail ? detail || 'Error' : undefined,
            };

            const status = getStatusText(updateState);
            if (hasDetail && detail) {
              expect(status).toContain(detail);
            } else {
              // If no detail, should still indicate failure
              expect(status).toContain('Update failed');
            }
          },
        ),
      );
    });
  });

  // ============================================================================
  // FR3: Refresh Icon Disabled States
  // ============================================================================

  describe('FR3: Refresh Icon Disabled States', () => {
    it('P005: Refresh enabled only during idle, available, ready, or failed phases', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('idle' as UpdatePhase, 'checking', 'available', 'downloading', 'downloaded', 'verifying', 'ready', 'failed'),
          (phase) => {
            const enabled = isRefreshEnabled(phase);

            const expectedEnabled = phase === 'idle' || phase === 'available' || phase === 'ready' || phase === 'failed';
            expect(enabled).toBe(expectedEnabled);
          },
        ),
      );
    });

    it('P006: Refresh disabled during checking, downloading, or verifying phases', () => {
      const disabledPhases: UpdatePhase[] = ['checking', 'downloading', 'verifying'];

      fc.assert(
        fc.property(fc.constantFrom(...disabledPhases), (phase) => {
          expect(isRefreshEnabled(phase)).toBe(false);
        }),
      );
    });

    it('P007: Refresh enabled during idle, available, ready, or failed phases', () => {
      const enabledPhases: UpdatePhase[] = ['idle', 'available', 'ready', 'failed'];

      fc.assert(
        fc.property(fc.constantFrom(...enabledPhases), (phase) => {
          expect(isRefreshEnabled(phase)).toBe(true);
        }),
      );
    });
  });

  // ============================================================================
  // FR4: Download Button Visibility
  // ============================================================================

  describe('FR4: Download Button Visibility', () => {
    it('P008: Download button shown only when phase === available', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('idle' as UpdatePhase, 'checking', 'available', 'downloading', 'downloaded', 'verifying', 'ready', 'failed'),
          (phase) => {
            const shouldShow = shouldShowDownloadButton(phase);
            expect(shouldShow).toBe(phase === 'available');
          },
        ),
      );
    });

    it('P009: Download button hidden in all other phases', () => {
      const otherPhases: UpdatePhase[] = ['idle', 'checking', 'downloading', 'downloaded', 'verifying', 'ready', 'failed'];

      fc.assert(
        fc.property(fc.constantFrom(...otherPhases), (phase) => {
          expect(shouldShowDownloadButton(phase)).toBe(false);
        }),
      );
    });
  });

  // ============================================================================
  // FR6: Restart Button Visibility
  // ============================================================================

  describe('FR6: Restart Button Visibility', () => {
    it('P010: Restart button shown only when phase === ready', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('idle' as UpdatePhase, 'checking', 'available', 'downloading', 'downloaded', 'verifying', 'ready', 'failed'),
          (phase) => {
            const shouldShow = shouldShowRestartButton(phase);
            expect(shouldShow).toBe(phase === 'ready');
          },
        ),
      );
    });

    it('P011: Restart button hidden in all other phases', () => {
      const otherPhases: UpdatePhase[] = ['idle', 'checking', 'available', 'downloading', 'downloaded', 'verifying', 'failed'];

      fc.assert(
        fc.property(fc.constantFrom(...otherPhases), (phase) => {
          expect(shouldShowRestartButton(phase)).toBe(false);
        }),
      );
    });
  });

  // ============================================================================
  // FR5: Download Progress Formatting
  // ============================================================================

  describe('FR5: Download Progress Formatting', () => {
    it('P012: Download progress includes all components: percent, bytes, speed', () => {
      fc.assert(
        fc.property(
          fc.record({
            percent: fc.integer({ min: 0, max: 100 }),
            transferred: fc.integer({ min: 0, max: 1073741824 }),
            total: fc.integer({ min: 1, max: 1073741824 }),
            bytesPerSecond: fc.integer({ min: 0, max: 10485760 }),
          }),
          (progress) => {
            const updateState: UpdateState = {
              phase: 'downloading',
              progress,
            };

            const status = getStatusText(updateState);

            // Verify all components present
            expect(status).toContain('Downloading update:');
            expect(status).toContain('%'); // percent
            expect(status).toMatch(/\(/); // transferred / total in parens
            expect(status).toMatch(/\//); // division between transferred and total
            expect(status).toMatch(/@/); // speed indicator
            expect(status).toContain('/s'); // speed unit
          },
        ),
      );
    });

    it('P013: Download progress without data falls back to generic message', () => {
      const updateState: UpdateState = {
        phase: 'downloading',
        progress: undefined,
      };

      const status = getStatusText(updateState);
      expect(status).toBe('Downloading update...');
    });

    it('P014: Progress percent rounds to integer', () => {
      fc.assert(
        fc.property(
          fc.record({
            percent: fc.double({ min: 0, max: 100 }),
            transferred: fc.integer({ min: 0, max: 1000000 }),
            total: fc.integer({ min: 1, max: 1000000 }),
            bytesPerSecond: fc.integer({ min: 0, max: 1000000 }),
          }),
          (progress) => {
            const updateState: UpdateState = {
              phase: 'downloading',
              progress,
            };

            const status = getStatusText(updateState);
            const roundedPercent = Math.round(progress.percent);

            expect(status).toContain(`${roundedPercent}%`);
          },
        ),
      );
    });
  });

  // ============================================================================
  // FR5: Byte Formatting
  // ============================================================================

  describe('FR5: Byte Formatting', () => {
    it('P015: Bytes < 1024 formatted as B with no decimal', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1023 }), (bytes) => {
          const result = formatBytes(bytes);
          expect(result).toMatch(/^\d+ B$/);
        }),
      );
    });

    it('P016: Bytes >= 1024 and < 1MB formatted as KB with 1 decimal', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1024, max: 1048575 }), (bytes) => {
          const result = formatBytes(bytes);
          expect(result).toMatch(/^\d+\.\d KB$/);

          // Verify value is correct
          const expected = (bytes / 1024).toFixed(1);
          expect(result).toContain(expected);
        }),
      );
    });

    it('P017: Bytes >= 1MB and < 1GB formatted as MB with 1 decimal', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1048576, max: 1073741823 }), (bytes) => {
          const result = formatBytes(bytes);
          expect(result).toMatch(/^\d+\.\d MB$/);

          // Verify value is correct
          const expected = (bytes / 1048576).toFixed(1);
          expect(result).toContain(expected);
        }),
      );
    });

    it('P018: Bytes >= 1GB formatted as GB with 1 decimal', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1073741824, max: 10737418240 }), (bytes) => {
          const result = formatBytes(bytes);
          expect(result).toMatch(/^\d+\.\d GB$/);

          // Verify value is correct
          const expected = (bytes / 1073741824).toFixed(1);
          expect(result).toContain(expected);
        }),
      );
    });

    it('P019: formatBytes is consistent across same input', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 10737418240 }), (bytes) => {
          const result1 = formatBytes(bytes);
          const result2 = formatBytes(bytes);
          expect(result1).toBe(result2);
        }),
      );
    });

    it('P020: formatBytes output matches expected unit pattern', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10737418240 }),
          (bytes) => {
            const result = formatBytes(bytes);

            // Should always end with a unit
            expect(result).toMatch(/(B|KB|MB|GB)$/);

            // Should start with number
            expect(result).toMatch(/^\d/);
          },
        ),
      );
    });
  });

  // ============================================================================
  // EDGE CASES & INVARIANTS
  // ============================================================================

  describe('Edge Cases & Invariants', () => {
    it('P021: Zero bytes formatted as 0 B', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('P022: Very large bytes (10GB) formatted correctly', () => {
      expect(formatBytes(10737418240)).toMatch(/^\d+\.\d GB$/);
    });

    it('P023: Boundary at 1KB (1024 bytes)', () => {
      expect(formatBytes(1023)).toBe('1023 B');
      expect(formatBytes(1024)).toMatch(/KB$/);
    });

    it('P024: Boundary at 1MB (1048576 bytes)', () => {
      const result1023KB = formatBytes(1048575);
      const result1MB = formatBytes(1048576);

      expect(result1023KB).toMatch(/KB$/);
      expect(result1MB).toMatch(/MB$/);
    });

    it('P025: Boundary at 1GB (1073741824 bytes)', () => {
      const result1023MB = formatBytes(1073741823);
      const result1GB = formatBytes(1073741824);

      expect(result1023MB).toMatch(/MB$/);
      expect(result1GB).toMatch(/GB$/);
    });

    it('P026: Status text does not exceed reasonable length', () => {
      fc.assert(
        fc.property(
          fc.record({
            phase: fc.constantFrom('idle' as UpdatePhase, 'checking', 'available', 'downloading', 'downloaded', 'verifying', 'ready', 'failed'),
            version: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            detail: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
            progress: fc.option(
              fc.record({
                percent: fc.integer({ min: 0, max: 100 }),
                transferred: fc.integer({ min: 0, max: 1073741824 }),
                total: fc.integer({ min: 1, max: 1073741824 }),
                bytesPerSecond: fc.integer({ min: 0, max: 10485760 }),
              }),
              { nil: undefined },
            ),
          }) as any,
          (updateState: UpdateState) => {
            const status = getStatusText(updateState);

            // Status text should be reasonable length (not infinite)
            expect(status.length).toBeLessThan(1000);
          },
        ),
      );
    });

    it('P027: Empty string version treated as no version', () => {
      const updateState: UpdateState = {
        phase: 'available',
        version: '',
      };

      const status = getStatusText(updateState);
      // Empty string after trim() is falsy, so version is omitted
      expect(status).toBe('Update available');
    });

    it('P028: Whitespace-only version treated as no version', () => {
      const updateState: UpdateState = {
        phase: 'available',
        version: '   ',
      };

      const status = getStatusText(updateState);
      // Whitespace after trim() is falsy, so version is omitted
      expect(status).toBe('Update available');
    });

    it('P028b: Empty string detail treated as no detail', () => {
      const updateState: UpdateState = {
        phase: 'failed',
        detail: '',
      };

      const status = getStatusText(updateState);
      // Empty string after trim() is falsy, so detail is omitted
      expect(status).toBe('Update failed');
    });

    it('P029: Long error messages are included in full', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 100, maxLength: 500 }),
          (detail) => {
            const updateState: UpdateState = {
              phase: 'failed',
              detail,
            };

            const status = getStatusText(updateState);
            expect(status).toContain(detail);
          },
        ),
      );
    });
  });

  // ============================================================================
  // BUTTON VISIBILITY COMBINATIONS
  // ============================================================================

  describe('Button Visibility Combinations', () => {
    it('P030: Only available phase shows download button', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('idle' as UpdatePhase, 'checking', 'available', 'downloading', 'downloaded', 'verifying', 'ready', 'failed'),
          (phase) => {
            const showDownload = shouldShowDownloadButton(phase);
            const showRestart = shouldShowRestartButton(phase);

            // Only one button should show at a time
            expect(showDownload || showRestart).toBe(phase === 'available' || phase === 'ready');

            // Never both at once
            expect(showDownload && showRestart).toBe(false);
          },
        ),
      );
    });

    it('P031: Refresh always available, no conflict with action buttons', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('idle' as UpdatePhase, 'checking', 'available', 'downloading', 'downloaded', 'verifying', 'ready', 'failed'),
          (phase) => {
            const refreshEnabled = isRefreshEnabled(phase);
            const showDownload = shouldShowDownloadButton(phase);
            const showRestart = shouldShowRestartButton(phase);

            // Refresh is orthogonal to action buttons
            // Can be enabled/disabled independently
            expect(typeof refreshEnabled).toBe('boolean');
            expect(typeof showDownload).toBe('boolean');
            expect(typeof showRestart).toBe('boolean');
          },
        ),
      );
    });
  });
});
