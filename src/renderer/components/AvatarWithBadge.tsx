import React from 'react';
import { Box, Circle } from '@chakra-ui/react';
import { Avatar } from './Avatar';
import { ShieldCheckIcon, ShieldWarningIcon, ShieldOffIcon } from './avatar-icons';
import type { ProfileSource } from '../../shared/profile-types';

/**
 * Avatar with Status Badge
 *
 * Combines Avatar component with profile status badge overlay.
 * Badge shows profile source (private/public/none) as icon.
 *
 * This is a complete, trivial implementation.
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
   * Profile data source (determines badge icon)
   * - 'private_authored' | 'private_received' → ShieldCheckIcon
   * - 'public_discovered' → ShieldWarningIcon
   * - null/undefined → ShieldOffIcon
   */
  profileSource?: ProfileSource | null;

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
   * Badge background color (for contrast)
   */
  badgeBackgroundColor?: string;

  /**
   * Badge icon color
   */
  badgeIconColor?: string;
}

/**
 * Determine badge icon based on profile source
 *
 * CONTRACT:
 *   Inputs:
 *     - profileSource: ProfileSource | null | undefined
 *
 *   Outputs:
 *     - React component (icon)
 *
 *   Invariants:
 *     - Always returns a valid icon component
 *
 *   Properties:
 *     - Exhaustive: covers all ProfileSource values plus null/undefined
 *     - Deterministic: same source always returns same icon
 *
 *   Algorithm:
 *     If source is 'private_authored' OR 'private_received':
 *       Return ShieldCheckIcon (verified/authenticated)
 *     Else if source is 'public_discovered':
 *       Return ShieldWarningIcon (partial information)
 *     Else (null or undefined):
 *       Return ShieldOffIcon (no profile data)
 */
interface BadgeInfo {
  Icon: React.FC;
  testId: string;
}

function getBadgeInfo(profileSource?: ProfileSource | null): BadgeInfo {
  if (profileSource === 'private_authored' || profileSource === 'private_received') {
    return { Icon: ShieldCheckIcon, testId: 'profile-badge-private' };
  } else if (profileSource === 'public_discovered') {
    return { Icon: ShieldWarningIcon, testId: 'profile-badge-public' };
  } else {
    return { Icon: ShieldOffIcon, testId: 'profile-badge-none' };
  }
}

export const AvatarWithBadge: React.FC<AvatarWithBadgeProps> = ({
  displayName,
  pictureUrl,
  profileSource,
  size = 32,
  backgroundColor = 'blue.500',
  textColor = 'white',
  badgeBackgroundColor = 'white',
  badgeIconColor = 'gray.700',
}) => {
  const { Icon: BadgeIcon, testId } = getBadgeInfo(profileSource);
  const badgeSize = Math.round(size * 0.4); // Badge is ~40% of avatar size

  return (
    <Box position="relative" display="inline-block" data-testid="avatar-with-badge">
      <Avatar
        displayName={displayName}
        pictureUrl={pictureUrl}
        size={size}
        backgroundColor={backgroundColor}
        textColor={textColor}
      />
      {/* Badge overlay - positioned at top-right corner
          Enhanced for WCAG AA contrast (4.5:1) on all backgrounds:
          - High opacity background (near-solid)
          - Dark border for visibility on light backgrounds
          - Shadow for additional separation from avatar image */}
      <Circle
        size={`${badgeSize}px`}
        bg={badgeBackgroundColor}
        color={badgeIconColor}
        position="absolute"
        top="-2px"
        right="-2px"
        border="2px solid"
        borderColor="gray.800"
        boxShadow="0 0 4px rgba(0,0,0,0.5)"
        data-testid={testId}
      >
        <Box fontSize={`${badgeSize * 0.7}px`} lineHeight="1">
          <BadgeIcon />
        </Box>
      </Circle>
    </Box>
  );
};
