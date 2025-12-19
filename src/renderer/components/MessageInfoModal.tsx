import React from 'react';
import { Dialog, Box, Code, Text, HStack, Badge } from '@chakra-ui/react';
import { useThemeColors } from '../themes/ThemeContext';
import type { NostlingMessage } from '../../shared/types';

/**
 * Message Info Modal Component
 *
 * CONTRACT:
 *   Inputs:
 *     - isOpen: boolean flag, indicates whether modal is visible
 *     - onClose: callback function, invoked when modal should close
 *     - message: object, the full message data to display as JSON
 *
 *   Outputs:
 *     - React component rendering a modal dialog with pretty-printed JSON
 *
 *   Invariants:
 *     - JSON is always pretty-printed with 2-space indentation
 *     - Content is displayed in monospace font
 *     - Modal closes on backdrop click or close button
 *     - Message kind is displayed with human-readable label
 *
 *   Properties:
 *     - Deterministic rendering: same message always produces identical output
 *     - Theme-aware: respects current theme colors
 */

export interface MessageInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: NostlingMessage | null;
}

/**
 * Get human-readable label for Nostr event kind
 */
function getKindLabel(kind: number | undefined): string {
  if (kind === undefined) {
    return 'Unknown (legacy message)';
  }
  switch (kind) {
    case 4:
      return 'NIP-04 Encrypted DM';
    case 14:
      return 'NIP-17 Private DM';
    case 1059:
      return 'NIP-59 Gift Wrap';
    default:
      return `Kind ${kind}`;
  }
}

export function MessageInfoModal({
  isOpen,
  onClose,
  message,
}: MessageInfoModalProps): JSX.Element {
  const colors = useThemeColors();

  const jsonContent = message ? JSON.stringify(message, null, 2) : '';
  const kindLabel = message ? getKindLabel(message.kind) : '';

  return (
    <Dialog.Root open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxW="600px" data-testid="message-info-modal">
          <Dialog.Header>
            <Dialog.Title>Message Details</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger />
          <Dialog.Body>
            {message && (
              <HStack mb="4" data-testid="message-kind-display">
                <Text color={colors.textMuted} fontSize="sm">
                  Message Kind:
                </Text>
                <Badge
                  colorPalette={message.kind === 4 ? 'blue' : message.kind === 14 ? 'green' : 'gray'}
                  data-testid="message-kind-badge"
                >
                  {kindLabel}
                </Badge>
              </HStack>
            )}
            <Box
              as="pre"
              p="4"
              bg={colors.surfaceBgSubtle}
              borderRadius="md"
              borderWidth="1px"
              borderColor={colors.border}
              overflowX="auto"
              maxH="400px"
              overflowY="auto"
              fontSize="sm"
              fontFamily="mono"
              color={colors.text}
              whiteSpace="pre-wrap"
              wordBreak="break-word"
              data-testid="message-info-json"
            >
              <Code
                display="block"
                bg="transparent"
                p="0"
                fontFamily="mono"
                fontSize="sm"
                color={colors.text}
              >
                {jsonContent}
              </Code>
            </Box>
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
