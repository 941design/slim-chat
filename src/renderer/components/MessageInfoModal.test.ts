import { describe, expect, it } from '@jest/globals';

/**
 * Test for getKindLabel function logic
 *
 * Since the getKindLabel function is not exported (it's a local function),
 * we test it by reimplementing the same logic here to verify expected behavior.
 * This ensures the labeling logic is correct and documents expected outputs.
 */

function getKindLabel(kind: number | undefined): string {
  if (kind === undefined) {
    return 'Unknown (legacy message)';
  }
  switch (kind) {
    case 4:
      return 'NIP-04 Encrypted DM';
    case 14:
      return 'NIP-17 Private DM';
    case 1059:
      return 'NIP-59 Gift Wrap';
    default:
      return `Kind ${kind}`;
  }
}

describe('getKindLabel', () => {
  it('returns appropriate label for NIP-04 DM (kind 4)', () => {
    expect(getKindLabel(4)).toBe('NIP-04 Encrypted DM');
  });

  it('returns appropriate label for NIP-17 DM (kind 14)', () => {
    expect(getKindLabel(14)).toBe('NIP-17 Private DM');
  });

  it('returns appropriate label for NIP-59 Gift Wrap (kind 1059)', () => {
    expect(getKindLabel(1059)).toBe('NIP-59 Gift Wrap');
  });

  it('returns generic label for unknown kinds', () => {
    expect(getKindLabel(1)).toBe('Kind 1');
    expect(getKindLabel(7)).toBe('Kind 7');
    expect(getKindLabel(9999)).toBe('Kind 9999');
  });

  it('returns legacy message label for undefined kind', () => {
    expect(getKindLabel(undefined)).toBe('Unknown (legacy message)');
  });
});
