import React from 'react';
import { Dialog, Button, VStack, Text, Box } from '@chakra-ui/react';
import { QRCodeSVG } from 'qrcode.react';
import { useThemeContext } from '../themes/ThemeContext';
import { getTheme } from '../themes/definitions';

/**
 * QR Code Display Modal Component
 *
 * CONTRACT:
 *   Inputs:
 *     - isOpen: boolean flag, indicates whether modal is visible
 *     - onClose: callback function, invoked when modal should close
 *     - npub: string, non-empty, valid npub to encode as QR code
 *     - label: string (optional), human-readable identity label for display
 *
 *   Outputs:
 *     - React component rendering a modal dialog with QR code visualization
 *
 *   Invariants:
 *     - QR code always encodes the exact npub string (no modification)
 *     - npub text displayed below QR code matches encoded value
 *     - Modal size matches QrCodeScannerModal for consistency
 *
 *   Properties:
 *     - Deterministic rendering: same npub always produces identical QR code
 *     - Accessibility: npub text is selectable for manual copy
 *     - Responsive: QR code scales appropriately within modal
 *
 *   Algorithm:
 *     1. Render modal dialog using Chakra UI Dialog pattern
 *     2. Display QRCodeSVG component with npub as data:
 *        a. Size: 256x256 pixels (readable on most screens)
 *        b. Error correction level: M (medium, 15% recovery)
 *        c. Include quiet zone (margin) for scanner compatibility
 *     3. Display npub text below QR code:
 *        a. Truncate if necessary for layout
 *        b. Allow text selection for manual copy
 *     4. Display identity label if provided (above QR code)
 *     5. Close modal on backdrop click or close button
 *
 *   QR Code Configuration:
 *     - Format: SVG (scalable, crisp on all displays)
 *     - Size: 256x256 pixels
 *     - Error correction: M (medium) - balances density and recoverability
 *     - Level: Automatically determined by data length
 *     - Colors: Theme-aware (dark mode: white on dark gray, light mode: black on white)
 *
 *   Layout:
 *     - Modal width: matches ContactModal width for consistency
 *     - Content: Vertically centered in modal body
 *     - Spacing: Identity label (if present) → QR code → npub text
 *     - Padding: Adequate white space around QR code
 */

export interface QrCodeDisplayModalProps {
  isOpen: boolean;
  onClose: () => void;
  npub: string;
  label?: string;
}

export function QrCodeDisplayModal({
  isOpen,
  onClose,
  npub,
  label,
}: QrCodeDisplayModalProps): JSX.Element {
  const { themeId } = useThemeContext();

  // Theme-aware QR code colors
  // dark themes use white QR on dark background for readability
  // light themes use black QR on white background (standard QR code appearance)
  const theme = getTheme(themeId);
  const isDark = theme.metadata.brightness === 'dark';
  const fgColor = isDark ? '#ffffff' : '#000000';
  const bgColor = isDark ? '#1a202c' : '#ffffff';

  return (
    <Dialog.Root open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxW="500px">
          <Dialog.Header>
            <Dialog.Title>Identity QR Code</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger />
          <Dialog.Body>
            <VStack gap="4" align="center" justify="center">
              {label && (
                <Text fontSize="sm" fontWeight="medium" data-testid="identity-label">
                  {label}
                </Text>
              )}
              <Box>
                <QRCodeSVG
                  value={npub}
                  size={256}
                  level="M"
                  includeMargin={true}
                  fgColor={fgColor}
                  bgColor={bgColor}
                  data-testid="qr-code"
                />
              </Box>
              <Text
                fontSize="xs"
                color="gray.600"
                textAlign="center"
                userSelect="all"
                data-testid="npub-text"
                aria-label="npub"
              >
                {npub}
              </Text>
            </VStack>
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
