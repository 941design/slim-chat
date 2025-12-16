/**
 * Theme Preview Component
 *
 * Renders a comprehensive preview of UI elements with a specific theme applied.
 * Uses isolated ThemeProvider to prevent affecting the main app.
 */

import React from 'react';
import { Box, VStack, HStack, Text, Button, Textarea } from '@chakra-ui/react';
import { ThemeId } from '../../themes/definitions';
import { ThemeProvider, ColorProvider, useThemeColors } from '../../themes/ThemeContext';
import type { ThemeSemanticColors } from '../../themes/useTheme';
import { AvatarWithBadge } from '../AvatarWithBadge';

export interface ThemePreviewProps {
  /**
   * Theme to preview (used when customColors is not provided)
   */
  themeId: ThemeId;

  /**
   * Optional custom colors to preview instead of a registered theme
   * When provided, themeId is ignored and these colors are used directly
   */
  customColors?: ThemeSemanticColors;
}

/**
 * Mock Header Section
 * Demonstrates header styling (brand color, menu background, borders)
 */
function MockHeaderSection(): React.ReactElement {
  const colors = useThemeColors();
  return (
    <HStack
      data-testid="mock-header-section"
      justify="space-between"
      align="center"
      p={3}
      bg={colors.surfaceBg}
      borderBottom="1px solid"
      borderColor={colors.border}
      borderRadius="md"
    >
      <Text fontSize="lg" fontWeight="semibold" color="brand.400">
        Nostling
      </Text>
      <Text fontSize="lg" color={colors.textMuted}>
        ☰
      </Text>
    </HStack>
  );
}

/**
 * Mock Avatar Section
 * Demonstrates contact card styling with AvatarWithBadge and name label
 */
function MockAvatarSection(): React.ReactElement {
  const colors = useThemeColors();
  return (
    <Box
      data-testid="mock-avatar-section"
      bg={colors.surfaceBg}
      p={3}
      borderRadius="md"
    >
      <HStack justify="space-between" align="center">
        {/* Contact card with border and background */}
        <Box
          borderWidth="1px"
          borderColor={colors.border}
          borderRadius="md"
          p={2}
          bg={colors.surfaceBgSelected}
          maxW="200px"
        >
          <HStack gap={3}>
            <AvatarWithBadge
              displayName="Alice"
              profileSource="private_authored"
              size={32}
              backgroundColor={colors.surfaceBgSubtle}
              textColor={colors.text}
              badgeBackgroundColor={colors.surfaceBg}
              badgeIconColor={colors.text}
            />
            <Text fontSize="md" fontWeight="semibold" color={colors.text} fontFamily="body">
              Alice
            </Text>
          </HStack>
        </Box>
        <Button
          size="sm"
          variant="outline"
          colorPalette="blue"
        >
          Apply
        </Button>
      </HStack>
    </Box>
  );
}

/**
 * Mock Conversation Section
 * Demonstrates chat bubbles (sent/received), text hierarchy, background variations, and message input
 */
function MockConversationSection(): React.ReactElement {
  const colors = useThemeColors();
  return (
    <Box
      data-testid="mock-conversation-section"
      bg={colors.appBg}
      p={3}
      borderRadius="md"
    >
      <VStack align="stretch" gap={3}>
        <HStack justify="flex-start">
          <Box
            bg={colors.surfaceBgSubtle}
            color={colors.text}
            borderWidth="1px"
            borderColor={colors.border}
            p={3}
            borderRadius="md"
            fontSize="md"
            maxW="70%"
            fontFamily="body"
          >
            Hey there! How are you?
          </Box>
        </HStack>

        <HStack justify="flex-end">
          <Box
            bg={colors.ownBubbleBg}
            color={colors.ownBubbleText}
            borderWidth="1px"
            borderColor={colors.ownBubbleBorder}
            p={3}
            borderRadius="md"
            fontSize="md"
            maxW="70%"
            fontFamily="body"
          >
            Doing great, thanks for asking!
          </Box>
        </HStack>

        <Textarea
          placeholder="Type a message..."
          size="sm"
          bg={colors.surfaceBg}
          borderColor={colors.border}
          rows={2}
        />
      </VStack>
    </Box>
  );
}

/**
 * Mock Button Section
 * Demonstrates button variants (primary, outline, ghost)
 */
function MockButtonSection(): React.ReactElement {
  const colors = useThemeColors();
  return (
    <Box
      data-testid="mock-button-section"
      bg={colors.surfaceBgSubtle}
      p={3}
      borderRadius="md"
    >
      <HStack gap={3} wrap="wrap">
        <Button colorPalette="blue" size="sm">
          Primary
        </Button>
        <Button variant="outline" size="sm">
          Outline
        </Button>
        <Button variant="ghost" size="sm">
          Ghost
        </Button>
      </HStack>
    </Box>
  );
}

/**
 * Mock Footer Section
 * Demonstrates footer styling, muted text, borders
 */
function MockFooterSection(): React.ReactElement {
  const colors = useThemeColors();
  return (
    <HStack
      data-testid="mock-footer-section"
      justify="space-between"
      align="center"
      p={3}
      bg={colors.surfaceBg}
      borderTop="1px solid"
      borderColor={colors.border}
      borderRadius="md"
    >
      <Text fontSize="sm" color={colors.textSubtle}>
        v0.0.34
      </Text>
      <Text fontSize="sm" color={colors.textMuted}>
        Connected
      </Text>
      <Text fontSize="lg" cursor="pointer" color={colors.textMuted}>
        ⟳
      </Text>
    </HStack>
  );
}

/**
 * Theme Preview Component
 *
 * CONTRACT:
 *   Inputs:
 *     - themeId: identifier for theme to preview
 *
 *   Outputs:
 *     - React element containing:
 *       * Fixed-size container (600px × 450px, scrollable)
 *       * Isolated ThemeProvider wrapping all content
 *       * Six mock sections demonstrating UI elements:
 *         1. Header (brand, menu icon, surface styling)
 *         2. Avatars (all three profile badge states)
 *         3. Conversation (chat bubbles with sent/received messages + textarea input)
 *         4. Buttons (primary, outline, ghost variants)
 *         5. Input (text input only)
 *         6. Footer (version, status, action icon)
 *
 *   Invariants:
 *     - Preview uses specified themeId, isolated from main app theme
 *     - All UI elements use semantic theme colors only (no hardcoded colors except brand.400)
 *     - Text is significantly larger than previous implementation (minimum 14px, bubbles 16px)
 *     - All content fits within scrollable 600px × 450px container
 *     - Preview is static (no animations or dynamic state)
 *     - All major semantic colors from theme palette are visible somewhere in preview
 *     - Preview updates immediately when themeId prop changes (via React.memo)
 *
 *   Properties:
 *     - Isolation: preview ThemeProvider does not interfere with parent ThemeProvider
 *     - Responsiveness: changing themeId updates preview immediately via memoization
 *     - Visual fidelity: preview demonstrates actual theme application to real components
 *     - Performance: preview re-renders only when themeId changes
 *     - Completeness: all major UI element types are represented (avatars, buttons, inputs, text, borders, backgrounds)
 *     - Readability: all text and elements are clearly readable without scaling artifacts
 *
 *   Algorithm:
 *     1. Create fixed container (600px × 450px, scrollable)
 *     2. Wrap all content in isolated ThemeProvider with specified themeId
 *     3. Render VStack with six mock sections:
 *        a. MockHeaderSection: demonstrates header styling
 *        b. MockAvatarSection: shows AvatarWithBadge with all three profile states (private, public, none)
 *        c. MockConversationSection: displays sent and received message bubbles + textarea for message input
 *        d. MockButtonSection: shows Button component with three variants (primary, outline, ghost)
 *        e. MockInputSection: shows Input component with borders/backgrounds
 *        f. MockFooterSection: demonstrates footer styling with muted text
 *     4. Each section uses useThemeColors() hook to get semantic colors
 *     5. All elements sized for clarity and inspection (no uniform scaling)
 */
/**
 * Inner preview content wrapped by a provider
 */
function PreviewContent(): React.ReactElement {
  return (
    <VStack align="stretch" gap={4} width="100%">
      <MockHeaderSection />
      <MockAvatarSection />
      <MockConversationSection />
    </VStack>
  );
}

function ThemePreviewComponent({ themeId, customColors }: ThemePreviewProps): React.ReactElement {
  const colors = useThemeColors();
  return (
    <Box
      data-testid="theme-preview"
      width="600px"
      height="450px"
      overflow="auto"
      borderRadius="md"
      border="1px solid"
      borderColor={colors.border}
      bg={colors.appBg}
      p={4}
    >
      {customColors ? (
        <ColorProvider colors={customColors}>
          <PreviewContent />
        </ColorProvider>
      ) : (
        <ThemeProvider themeId={themeId}>
          <PreviewContent />
        </ThemeProvider>
      )}
    </Box>
  );
}

export const ThemePreview = React.memo(
  ThemePreviewComponent,
  (prevProps, nextProps) =>
    prevProps.themeId === nextProps.themeId &&
    prevProps.customColors === nextProps.customColors
);

ThemePreview.displayName = 'ThemePreview';
