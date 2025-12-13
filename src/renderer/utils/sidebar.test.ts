import { describe, expect, it } from '@jest/globals';
import { abbreviateNpub, getPreferredDisplayName } from './sidebar';

describe('sidebar utilities', () => {
  it('abbreviates long npubs and leaves short ones intact', () => {
    expect(abbreviateNpub('npub123')).toBe('npub123');
    expect(abbreviateNpub('npub1234567890abcdef')).toBe('npub123456…abcdef');
  });

  it('prefers profile name over alias and npub', () => {
    const npub = 'npub1longexamplekeyvaluehere';
    expect(getPreferredDisplayName({ profileName: 'Profile Name', alias: 'Alias', npub })).toBe('Profile Name');
  });

  it('falls back to alias when profile name is missing', () => {
    const npub = 'npub1longexamplekeyvaluehere';
    expect(getPreferredDisplayName({ profileName: '', alias: 'Alias', npub })).toBe('Alias');
  });

  it('uses abbreviated npub when neither profile nor alias are present', () => {
    const npub = 'npub1longexamplekeyvaluehere';
    expect(getPreferredDisplayName({ profileName: null, alias: '', npub })).toBe(abbreviateNpub(npub));
  });
});
