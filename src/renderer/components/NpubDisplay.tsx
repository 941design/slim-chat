/**
 * NpubDisplay - Reusable component for displaying npub with QR code and copy icons.
 *
 * Shows a "Public Key" label followed by the npub value with inline icons that
 * appear on hover: QR code button and copy button.
 *
 * Used in:
 * - ContactsPanel (for contact npubs)
 * - IdentityProfileView (for identity npubs)
 */

import React from 'react';
import { Box, Text, HStack, IconButton } from '@chakra-ui/react';
import { useThemeColors } from '../themes/ThemeContext';
import { QrCodeIcon } from './qr-icons';
import { CopyButton } from './CopyButton';
import { useHoverInfoProps } from './HoverInfo';

export interface NpubDisplayProps {
  /** The npub string to display */
  npub: string;
  /** Callback when QR code button is clicked */
  onShowQr?: () => void;
  /** Test ID prefix for data-testid attributes */
  testIdPrefix?: string;
  /** Callback for copy message (legacy support) */
  onCopyMessage?: (message: string | null) => void;
}

export function NpubDisplay({
  npub,
  onShowQr,
  testIdPrefix = 'npub',
  onCopyMessage,
}: NpubDisplayProps): React.ReactElement {
  const colors = useThemeColors();

  return (
    <Box className="group">
      <Text fontSize="xs" color={colors.textMuted} mb={1}>
        Public Key
      </Text>
      <Text
        fontSize="xs"
        color={colors.textMuted}
        fontFamily="monospace"
        wordBreak="break-all"
        data-testid={`${testIdPrefix}-npub`}
        as="span"
        display="inline"
      >
        {npub}
        <HStack
          as="span"
          display="inline-flex"
          gap={0}
          opacity={0}
          _groupHover={{ opacity: 1 }}
          transition="opacity 0.15s"
          verticalAlign="middle"
          ml={1}
        >
          {onShowQr && (
            <Box as="span" display="inline" {...useHoverInfoProps('Display QR code for sharing')}>
              <IconButton
                size="xs"
                variant="ghost"
                aria-label="Show QR code"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowQr();
                }}
                color={colors.textSubtle}
                _hover={{ color: colors.textMuted }}
                data-testid={`${testIdPrefix}-show-qr`}
              >
                <QrCodeIcon />
              </IconButton>
            </Box>
          )}
          <Box as="span" display="inline" {...useHoverInfoProps('Copy public key to clipboard')}>
            <CopyButton
              size="xs"
              variant="ghost"
              aria-label="Copy npub"
              textToCopy={npub}
              color={colors.textSubtle}
              _hover={{ color: colors.textMuted }}
              data-testid={`${testIdPrefix}-copy-npub`}
              copyMessage="npub copied to clipboard"
              onCopyMessage={onCopyMessage}
            />
          </Box>
        </HStack>
      </Text>
    </Box>
  );
}

NpubDisplay.displayName = 'NpubDisplay';
