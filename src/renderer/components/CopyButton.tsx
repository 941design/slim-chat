/**
 * CopyButton - A button that copies text to clipboard with visual feedback.
 *
 * Shows a copy icon normally, switches to a green checkmark for 2 seconds after copying.
 * Can optionally display a message in the footer via HoverInfo context or onCopyMessage callback.
 */

import React, { useState, useCallback, useContext } from 'react';
import { IconButton, IconButtonProps } from '@chakra-ui/react';
import { useHoverInfo } from './HoverInfo';

// Copy icon
const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

// Checkmark icon
const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export interface CopyButtonProps extends Omit<IconButtonProps, 'aria-label' | 'onClick'> {
  /** Text to copy to clipboard */
  textToCopy: string;
  /** Duration in ms to show the checkmark (default: 2000) */
  feedbackDuration?: number;
  /** Custom aria-label (default: "Copy to clipboard") */
  'aria-label'?: string;
  /** Custom title for tooltip (default: "Copy to clipboard") */
  title?: string;
  /** Color when showing the checkmark (default: "green.400") */
  successColor?: string;
  /** Callback after successful copy */
  onCopy?: () => void;
  /** Message to display in footer on copy (e.g., "npub copied to clipboard") */
  copyMessage?: string;
  /**
   * Callback to display the copy message.
   * @deprecated Use HoverInfo context instead - CopyButton will automatically use it when available.
   */
  onCopyMessage?: (message: string | null) => void;
}

export function CopyButton({
  textToCopy,
  feedbackDuration = 2000,
  'aria-label': ariaLabel = 'Copy to clipboard',
  title = 'Copy to clipboard',
  successColor = 'green.400',
  onCopy,
  copyMessage,
  onCopyMessage,
  color,
  ...rest
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { showInfo, hideInfo } = useHoverInfo();

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      onCopy?.();

      // Show message in footer if copyMessage is provided
      // Use HoverInfo context (preferred) or legacy onCopyMessage callback
      if (copyMessage) {
        if (onCopyMessage) {
          // Legacy: use callback
          onCopyMessage(copyMessage);
          setTimeout(() => onCopyMessage(null), feedbackDuration);
        } else {
          // Preferred: use HoverInfo context
          showInfo(copyMessage);
          setTimeout(() => hideInfo(), feedbackDuration);
        }
      }

      setTimeout(() => setCopied(false), feedbackDuration);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }, [textToCopy, feedbackDuration, onCopy, copyMessage, onCopyMessage, showInfo, hideInfo]);

  return (
    <IconButton
      aria-label={ariaLabel}
      title={copied ? 'Copied!' : title}
      onClick={handleCopy}
      color={copied ? successColor : color}
      {...rest}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </IconButton>
  );
}
