/**
 * SidebarUserItem - Reusable user item component for sidebar lists.
 *
 * Displays a user (identity or contact) with avatar, name, optional badge,
 * and a three-dot icon button that triggers a callback when clicked.
 * Used by both IdentityList and ContactList for consistent UI.
 */

import React from 'react';
import { Box, HStack, Text, IconButton, Badge } from '@chakra-ui/react';
import { AvatarWithBadge } from './AvatarWithBadge';
import { useThemeColors } from '../themes/ThemeContext';

// Three vertical dots icon (same as MoreVerticalIcon in main.tsx)
const MoreVerticalIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

export interface SidebarUserItemProps {
  /** Unique identifier for the item */
  id: string;
  /** Display name to show */
  displayName: string;
  /** Optional npub for data attribute */
  npub?: string;
  /** URL for profile picture */
  pictureUrl?: string | null;
  /** Profile source for badge display (kept for API compatibility) */
  profileSource?: unknown;
  /** Whether this item is currently selected */
  isSelected: boolean;
  /** Whether this item has unread messages */
  hasUnread?: boolean;
  /** Count of unread messages */
  unreadCount?: number;
  /** Whether this is a newly arrived message (flash animation) */
  isNewlyArrived?: boolean;
  /** Whether the item is disabled (not clickable) */
  disabled?: boolean;
  /** CSS animation class for unread state */
  animationClass?: string;
  /** Callback when item is clicked */
  onClick: () => void;
  /** Callback when three-dot icon is clicked */
  onMoreClick: (event: React.MouseEvent) => void;
  /** Test ID prefix for data-testid attributes */
  testIdPrefix: 'identity' | 'contact';
  /** Aria label for the more button */
  moreButtonLabel?: string;
  /** Title/tooltip for the more button */
  moreButtonTitle?: string;
}

export function SidebarUserItem({
  id,
  displayName,
  npub,
  pictureUrl,
  profileSource,
  isSelected,
  hasUnread = false,
  unreadCount = 0,
  isNewlyArrived = false,
  disabled = false,
  animationClass = '',
  onClick,
  onMoreClick,
  testIdPrefix,
  moreButtonLabel = 'More options',
  moreButtonTitle = 'More options',
}: SidebarUserItemProps): React.ReactElement {
  const colors = useThemeColors();

  return (
    <Box
      borderWidth="1px"
      borderColor={
        hasUnread
          ? 'brand.400'
          : isSelected
            ? 'brand.400'
            : colors.border
      }
      borderRadius="md"
      p="2"
      bg={isSelected ? colors.surfaceBgSelected : 'transparent'}
      _hover={{
        borderColor: disabled ? undefined : 'brand.400',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onClick={() => !disabled && onClick()}
      opacity={disabled && !isSelected ? 0.5 : 1}
      pointerEvents={disabled && !isSelected ? 'none' : undefined}
      data-testid={`${testIdPrefix}-item-${id}`}
      data-npub={npub}
      className={`group ${animationClass}`}
      position="relative"
    >
      <HStack justify="space-between" align="center" gap="2">
        <HStack flex="1" gap="2">
          <AvatarWithBadge
            displayName={displayName}
            pictureUrl={pictureUrl}
            profileSource={profileSource}
            size={32}
            badgeBackgroundColor={colors.surfaceBg}
            badgeIconColor={colors.text}
          />
          <Text
            color={colors.text}
            fontWeight="semibold"
            lineClamp={1}
            flex="1"
            fontFamily="body"
          >
            {displayName}
          </Text>
          {hasUnread && unreadCount > 0 && (
            <Badge
              colorPalette="blue"
              variant="solid"
              borderRadius="full"
              fontSize="xs"
              px="2"
              minW="6"
              textAlign="center"
            >
              {unreadCount}
            </Badge>
          )}
        </HStack>
        <HStack
          gap="0"
          opacity={0}
          _groupHover={{ opacity: 1 }}
          transition="opacity 0.15s"
        >
          <IconButton
            size="xs"
            variant="ghost"
            aria-label={moreButtonLabel}
            title={moreButtonTitle}
            onClick={(e) => {
              e.stopPropagation();
              onMoreClick(e);
            }}
            color={colors.textSubtle}
            _hover={{ color: colors.textMuted }}
            data-testid={`${testIdPrefix}-more-${id}`}
          >
            <MoreVerticalIcon />
          </IconButton>
        </HStack>
      </HStack>
    </Box>
  );
}
