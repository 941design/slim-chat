/**
 * Theme Preview Component
 *
 * Renders a comprehensive preview of UI elements with a specific theme applied.
 * Uses isolated ThemeProvider to prevent affecting the main app.
 */

import React from 'react';
import { Box, VStack, HStack, Text, Button, Input, Textarea } from '@chakra-ui/react';
import { Field } from '@chakra-ui/react';
import { ThemeId } from '../../themes/definitions';
import { ThemeProvider, useThemeColors } from '../../themes/ThemeContext';
import { AvatarWithBadge } from '../AvatarWithBadge';

export interface ThemePreviewProps {
  /**
   * Theme to preview
   */
  themeId: ThemeId;
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
 * Demonstrates AvatarWithBadge component with all profile states
 */
function MockAvatarSection(): React.ReactElement {
  const colors = useThemeColors();
  return (
    <Box
      data-testid="mock-avatar-section"
      bg={colors.surfaceBgSubtle}
      p={3}
      borderRadius="md"
    >
      <VStack align="stretch" gap={2}>
        <Text fontSize="sm" fontWeight="semibold" color={colors.text}>
          Profile Indicators
        </Text>
        <HStack gap={4} wrap="wrap">
          <VStack align="center" gap={1}>
            <AvatarWithBadge
              displayName="Alice"
              profileSource="private_authored"
              size={40}
              backgroundColor={colors.surfaceBgSelected}
              textColor={colors.text}
              badgeBackgroundColor={colors.surfaceBg}
              badgeIconColor={colors.text}
            />
            <Text fontSize="xs" color={colors.textMuted}>
              Private
            </Text>
          </VStack>
          <VStack align="center" gap={1}>
            <AvatarWithBadge
              displayName="Bob"
              profileSource="public_discovered"
              size={40}
              backgroundColor={colors.surfaceBgSelected}
              textColor={colors.text}
              badgeBackgroundColor={colors.surfaceBg}
              badgeIconColor={colors.text}
            />
            <Text fontSize="xs" color={colors.textMuted}>
              Public
            </Text>
          </VStack>
          <VStack align="center" gap={1}>
            <AvatarWithBadge
              displayName="Carol"
              profileSource={null}
              size={40}
              backgroundColor={colors.surfaceBgSelected}
              textColor={colors.text}
              badgeBackgroundColor={colors.surfaceBg}
              badgeIconColor={colors.text}
            />
            <Text fontSize="xs" color={colors.textMuted}>
              None
            </Text>
          </VStack>
        </HStack>
      </VStack>
    </Box>
  );
}

/**
 * Mock Conversation Section
 * Demonstrates chat bubbles (sent/received), text hierarchy, background variations
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
        <Text fontSize="sm" fontWeight="semibold" color={colors.text} mb={1}>
          Messages
        </Text>

        <HStack justify="flex-start">
          <Box
            bg={colors.surfaceBg}
            color={colors.text}
            p={3}
            borderRadius="md"
            fontSize="md"
            maxW="70%"
          >
            Hey there! How are you?
          </Box>
        </HStack>

        <HStack justify="flex-end">
          <Box
            bg={colors.surfaceBgSelected}
            color={colors.text}
            p={3}
            borderRadius="md"
            fontSize="md"
            maxW="70%"
          >
            Doing great, thanks for asking!
          </Box>
        </HStack>

        <HStack justify="flex-start">
          <Box
            bg={colors.surfaceBg}
            color={colors.text}
            p={3}
            borderRadius="md"
            fontSize="md"
            maxW="70%"
          >
            That&apos;s wonderful to hear.
          </Box>
        </HStack>
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
      <VStack align="stretch" gap={2}>
        <Text fontSize="sm" fontWeight="semibold" color={colors.text}>
          Buttons
        </Text>
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
      </VStack>
    </Box>
  );
}

/**
 * Mock Input Section
 * Demonstrates input fields (Textarea, Input) with borders and backgrounds
 */
function MockInputSection(): React.ReactElement {
  const colors = useThemeColors();
  return (
    <Box
      data-testid="mock-input-section"
      bg={colors.surfaceBgSubtle}
      p={3}
      borderRadius="md"
    >
      <VStack align="stretch" gap={3}>
        <Text fontSize="sm" fontWeight="semibold" color={colors.text}>
          Inputs
        </Text>

        <Field.Root>
          <Field.Label fontSize="sm" color={colors.textMuted}>
            Text Input
          </Field.Label>
          <Input
            placeholder="Type something..."
            size="sm"
            bg={colors.surfaceBg}
            borderColor={colors.border}
          />
        </Field.Root>

        <Field.Root>
          <Field.Label fontSize="sm" color={colors.textMuted}>
            Textarea
          </Field.Label>
          <Textarea
            placeholder="Enter message..."
            size="sm"
            bg={colors.surfaceBg}
            borderColor={colors.border}
            rows={2}
          />
        </Field.Root>
      </VStack>
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
 *         3. Conversation (chat bubbles with sent/received messages)
 *         4. Buttons (primary, outline, ghost variants)
 *         5. Inputs (text input and textarea)
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
 *        c. MockConversationSection: displays sent and received message bubbles at readable size
 *        d. MockButtonSection: shows Button component with three variants (primary, outline, ghost)
 *        e. MockInputSection: shows Input and Textarea components with borders/backgrounds
 *        f. MockFooterSection: demonstrates footer styling with muted text
 *     4. Each section uses useThemeColors() hook to get semantic colors
 *     5. All elements sized for clarity and inspection (no uniform scaling)
 */
function ThemePreviewComponent({ themeId }: ThemePreviewProps): React.ReactElement {
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
      <ThemeProvider themeId={themeId}>
        <VStack align="stretch" gap={4} width="100%">
          <MockHeaderSection />
          <MockAvatarSection />
          <MockConversationSection />
          <MockButtonSection />
          <MockInputSection />
          <MockFooterSection />
        </VStack>
      </ThemeProvider>
    </Box>
  );
}

export const ThemePreview = React.memo(
  ThemePreviewComponent,
  (prevProps, nextProps) => prevProps.themeId === nextProps.themeId
);

ThemePreview.displayName = 'ThemePreview';
