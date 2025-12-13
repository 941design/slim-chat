import React from 'react';

/**
 * QR Code Icons
 *
 * Simple SVG icon components for QR code functionality.
 * Follow existing icon pattern from main.tsx (CopyIcon, HelpIcon, etc.)
 */

/**
 * Camera Icon
 *
 * CONTRACT:
 *   Inputs: None (uses implicit SVG sizing from parent IconButton)
 *   Outputs: SVG element with camera icon path
 *   Invariants: Icon size determined by parent element (1em x 1em)
 *   Properties: Pure component, no side effects
 */
export const CameraIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/**
 * QR Code Icon
 *
 * CONTRACT:
 *   Inputs: None (uses implicit SVG sizing from parent IconButton)
 *   Outputs: SVG element with QR code icon path
 *   Invariants: Icon size determined by parent element (1em x 1em)
 *   Properties: Pure component, no side effects
 */
export const QrCodeIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM15 19h2v2h-2zM17 13h2v2h-2zM19 15h2v2h-2zM17 17h2v2h-2zM19 19h2v2h-2z" />
  </svg>
);
