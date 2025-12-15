import React from 'react';

/**
 * Avatar Status Badge Icons
 *
 * Custom SVG shield-themed icons for profile status badges.
 * Follows existing icon pattern from qr-icons.tsx.
 */

/**
 * ShieldCheckIcon - Private profile available
 *
 * Represents verified/authenticated private profile.
 * Used when profile source is 'private_authored' or 'private_received'.
 */
export const ShieldCheckIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
  </svg>
);

/**
 * ShieldWarningIcon - Public profile displayed
 *
 * Represents public profile (kind:0) discovered on relays.
 * Used when profile source is 'public_discovered'.
 */
export const ShieldWarningIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm1 16h-2v-2h2v2zm0-4h-2V7h2v6z" />
  </svg>
);

/**
 * ShieldOffIcon - No profile (alias/npub fallback)
 *
 * Represents missing profile data, using alias or npub.
 * Used when profile source is null/undefined.
 */
export const ShieldOffIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" opacity="0.3" />
    <path d="M1 1l22 22-1.41 1.41L1 2.41 1 1zm2 4v6c0 4.8 3.2 9.2 7.5 11l.5-.12L4.5 15C3.2 13.4 2.5 11.3 2.5 9V5.83L2 5.41V5z" />
  </svg>
);
