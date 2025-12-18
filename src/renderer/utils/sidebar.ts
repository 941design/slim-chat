export function abbreviateNpub(npub: string): string {
  if (npub.length <= 16) return npub;
  return `${npub.slice(0, 10)}…${npub.slice(-6)}`;
}

/**
 * Returns the preferred display name for a contact or identity.
 *
 * Precedence is resolved in the backend (alias > private profile > public profile > npub).
 * The profileName field already contains the resolved display name, so this function
 * simply uses it with npub as a fallback for edge cases.
 *
 * @param profileName - The resolved display name from backend (already has precedence applied)
 * @param npub - The npub to use as fallback if profileName is missing
 */
export function getPreferredDisplayName({
  profileName,
  npub,
}: {
  profileName?: string | null;
  npub: string;
}): string {
  if (profileName && profileName.trim().length > 0) return profileName.trim();
  return abbreviateNpub(npub);
}
