import { describe, expect, it } from '@jest/globals';
import { abbreviateNpub, getPreferredDisplayName } from './sidebar';

describe('sidebar utilities', () => {
  it('abbreviates long npubs and leaves short ones intact', () => {
    expect(abbreviateNpub('npub123')).toBe('npub123');
    expect(abbreviateNpub('npub1234567890abcdef')).toBe('npub123456…abcdef');
  });

  it('returns profileName when present', () => {
    const npub = 'npub1longexamplekeyvaluehere';
    // profileName is the resolved display name from backend (already has precedence applied)
    expect(getPreferredDisplayName({ profileName: 'Resolved Name', npub })).toBe('Resolved Name');
  });

  it('uses abbreviated npub when profileName is missing', () => {
    const npub = 'npub1longexamplekeyvaluehere';
    expect(getPreferredDisplayName({ profileName: null, npub })).toBe(abbreviateNpub(npub));
  });

  it('uses abbreviated npub when profileName is empty', () => {
    const npub = 'npub1longexamplekeyvaluehere';
    expect(getPreferredDisplayName({ profileName: '', npub })).toBe(abbreviateNpub(npub));
  });
});
