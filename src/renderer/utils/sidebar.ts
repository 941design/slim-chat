import { NostlingContact, NostlingIdentity } from '../../shared/types';

export type SidebarEntry =
  | { type: 'identity'; identity: NostlingIdentity }
  | { type: 'contact'; contact: NostlingContact };

export function abbreviateNpub(npub: string): string {
  if (npub.length <= 16) return npub;
  return `${npub.slice(0, 10)}…${npub.slice(-6)}`;
}

export function getPreferredDisplayName({
  profileName,
  alias,
  npub,
}: {
  profileName?: string | null;
  alias?: string | null;
  npub: string;
}): string {
  if (profileName && profileName.trim().length > 0) return profileName.trim();
  if (alias && alias.trim().length > 0) return alias.trim();
  return abbreviateNpub(npub);
}

export function buildSidebarEntries(
  identities: NostlingIdentity[],
  contacts: NostlingContact[]
): SidebarEntry[] {
  const identityEntries: SidebarEntry[] = identities.map((identity) => ({ type: 'identity', identity }));
  const contactEntries: SidebarEntry[] = contacts.map((contact) => ({ type: 'contact', contact }));
  return [...identityEntries, ...contactEntries];
}
