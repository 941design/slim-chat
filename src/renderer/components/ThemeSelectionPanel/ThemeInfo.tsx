/**
 * Theme Info Component
 *
 * Displays theme name, description, and current theme indicator.
 */

import React from 'react';
import { Box, Text, HStack, Badge } from '@chakra-ui/react';
import { ThemeMetadata } from '../../themes/definitions';
import { useThemeColors } from '../../themes/ThemeContext';

export interface ThemeInfoProps {
  /**
   * Theme metadata to display
   */
  theme: ThemeMetadata;

  /**
   * Whether this theme is currently active in the main app
   */
  isCurrentTheme: boolean;
}

/**
 * Theme Info Display Component
 *
 * CONTRACT:
 *   Inputs:
 *     - theme: ThemeMetadata object containing name and description
 *     - isCurrentTheme: boolean flag indicating if this is the active theme
 *
 *   Outputs:
 *     - React element displaying:
 *       * Theme name in prominent text
 *       * Theme description in smaller text
 *       * "Current" badge if isCurrentTheme is true
 *
 *   Invariants:
 *     - Name always visible and readable
 *     - Description always visible (may wrap to multiple lines)
 *     - Badge only appears when isCurrentTheme equals true
 *     - Badge never appears when isCurrentTheme equals false
 *     - Text colors use semantic theme colors for consistency
 *
 *   Properties:
 *     - Visual hierarchy: name larger than description
 *     - Conditional badge: badge visibility equals isCurrentTheme
 *     - Accessibility: proper heading levels, readable contrast
 *     - Responsive: text wraps appropriately for different widths
 *
 *   Algorithm:
 *     1. Render theme name as prominent text (size: md, weight: bold)
 *     2. Render theme description as secondary text (size: sm, muted color)
 *     3. If isCurrentTheme equals true:
 *        a. Render "Current" badge next to name
 *        b. Use brand color palette for badge
 *     4. Use semantic colors from theme context
 */
export function ThemeInfo({ theme, isCurrentTheme }: ThemeInfoProps): React.ReactElement {
  const colors = useThemeColors();

  // Trivial implementation - just displays metadata
  return (
    <Box data-testid="theme-info">
      <HStack gap={2} mb={1}>
        <Text
          fontSize="md"
          fontWeight="bold"
          color={colors.text}
          data-testid="theme-info-name"
        >
          {theme.name}
        </Text>
        {isCurrentTheme && (
          <Badge colorPalette="blue" data-testid="theme-info-current-badge">
            Current
          </Badge>
        )}
      </HStack>
      <Text fontSize="sm" color={colors.textMuted} data-testid="theme-info-description">
        {theme.description}
      </Text>
    </Box>
  );
}
