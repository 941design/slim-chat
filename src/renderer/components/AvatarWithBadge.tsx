import React from 'react';
import { Avatar } from './Avatar';

/**
 * Avatar wrapper component for sidebar display.
 *
 * This component wraps the Avatar component for consistency
 * across contacts and identities in the sidebar.
 */

interface AvatarWithBadgeProps {
  /**
   * Display name for avatar letter and alt text
   */
  displayName: string;

  /**
   * Optional profile picture URL
   */
  pictureUrl?: string | null;

  /**
   * Profile data source (kept for API compatibility, not displayed)
   */
  profileSource?: unknown;

  /**
   * Avatar size in pixels
   * Default: 32px
   */
  size?: number;

  /**
   * Background color for letter circle (semantic theme color)
   */
  backgroundColor?: string;

  /**
   * Text color for letter (semantic theme color)
   */
  textColor?: string;

  /**
   * Kept for API compatibility (no longer used)
   */
  badgeBackgroundColor?: string;

  /**
   * Kept for API compatibility (no longer used)
   */
  badgeIconColor?: string;
}

export const AvatarWithBadge: React.FC<AvatarWithBadgeProps> = ({
  displayName,
  pictureUrl,
  size = 32,
  backgroundColor = 'blue.500',
  textColor = 'white',
}) => {
  return (
    <Avatar
      displayName={displayName}
      pictureUrl={pictureUrl}
      size={size}
      backgroundColor={backgroundColor}
      textColor={textColor}
    />
  );
};
