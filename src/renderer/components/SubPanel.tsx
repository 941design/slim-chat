/**
 * SubPanel Component
 *
 * Unified container for all sub-panel views (About, Relay Config, Theme Selection).
 * Provides consistent header styling with title and action buttons.
 */

import React from 'react';
import { Box, HStack, Heading, Button, Flex } from '@chakra-ui/react';
import { useThemeColors } from '../themes/ThemeContext';

export interface SubPanelAction {
  /**
   * Button label text
   */
  label: string;

  /**
   * Click handler
   */
  onClick: () => void;

  /**
   * Button variant (ghost for Cancel, outline for Apply/Return)
   */
  variant?: 'ghost' | 'outline' | 'solid';

  /**
   * Color palette for the button
   */
  colorPalette?: 'blue' | 'gray';

  /**
   * Whether the button is disabled
   */
  disabled?: boolean;

  /**
   * Test ID for the button
   */
  testId?: string;

  /**
   * Optional hover info props for displaying info text on hover.
   * Should include onMouseEnter and onMouseLeave handlers.
   */
  hoverProps?: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
}

export interface SubPanelProps {
  /**
   * Panel title displayed in the header
   */
  title: string;

  /**
   * Optional custom title element to render instead of plain text.
   * When provided, this replaces the default Heading with the custom element.
   * Useful for editable titles or titles with icons.
   */
  titleElement?: React.ReactNode;

  /**
   * Action buttons to display in the header (right side)
   * Typically Cancel/Apply or Return
   */
  actions: SubPanelAction[];

  /**
   * Panel content
   */
  children: React.ReactNode;

  /**
   * Test ID for the panel container
   */
  testId?: string;
}

/**
 * SubPanel container component providing consistent layout for all sub-views.
 *
 * Layout structure:
 * - Header: Title (left) + Action buttons (right)
 * - Content: Scrollable area for panel content
 */
export function SubPanel({
  title,
  titleElement,
  actions,
  children,
  testId,
}: SubPanelProps): React.ReactElement {
  const colors = useThemeColors();

  return (
    <Flex
      direction="column"
      h="100%"
      data-testid={testId}
    >
      {/* Header */}
      <HStack
        justify="space-between"
        align="center"
        p={4}
        borderBottomWidth="1px"
        borderColor={colors.border}
        bg={colors.surfaceBg}
        flexShrink={0}
      >
        {titleElement ?? (
          <Heading size="sm" color={colors.textMuted}>
            {title}
          </Heading>
        )}
        <HStack gap={2}>
          {actions.map((action, index) => (
            <Button
              key={action.label}
              size="sm"
              variant={action.variant ?? (index === actions.length - 1 ? 'outline' : 'ghost')}
              colorPalette={action.colorPalette ?? 'blue'}
              onClick={action.onClick}
              disabled={action.disabled}
              data-testid={action.testId}
              {...action.hoverProps}
            >
              {action.label}
            </Button>
          ))}
        </HStack>
      </HStack>

      {/* Content */}
      <Box
        flex={1}
        overflowY="auto"
        p={4}
      >
        {children}
      </Box>
    </Flex>
  );
}

SubPanel.displayName = 'SubPanel';
