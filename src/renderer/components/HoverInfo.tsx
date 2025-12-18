/**
 * HoverInfo - Context and components for displaying hover info text with hysteresis.
 *
 * Provides a footer-style info text that appears when hovering over clickable elements.
 * The text shows immediately on hover enter but has a delay (hysteresis) before
 * disappearing on hover leave, preventing flicker during quick mouse movements.
 *
 * Can work in two modes:
 * 1. Self-contained: Uses internal state and HoverInfoFooter to display text
 * 2. External: Uses an external setter function (e.g., main window footer)
 */

import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { useThemeColors } from '../themes/ThemeContext';

/**
 * Default delay before hiding the info text after mouse leaves (ms)
 */
const DEFAULT_HIDE_DELAY = 300;

interface HoverInfoContextValue {
  /**
   * Currently displayed info text (null when nothing to show)
   */
  infoText: string | null;

  /**
   * Show info text immediately
   */
  showInfo: (text: string) => void;

  /**
   * Schedule hiding info text with delay (hysteresis)
   */
  hideInfo: () => void;

  /**
   * Cancel any pending hide operation
   */
  cancelHide: () => void;
}

const HoverInfoContext = createContext<HoverInfoContextValue | null>(null);

interface HoverInfoProviderProps {
  /**
   * Children that can use the hover info context
   */
  children: React.ReactNode;

  /**
   * Delay in ms before hiding info text (default: 300ms)
   */
  hideDelay?: number;

  /**
   * Optional external setter function for the info text.
   * When provided, the provider will call this function instead of
   * managing its own state, allowing integration with an external
   * display mechanism (e.g., main window footer).
   */
  onInfoChange?: (text: string | null) => void;
}

/**
 * Provider component that manages hover info state with hysteresis.
 * Supports both internal state management and external setter integration.
 */
export function HoverInfoProvider({
  children,
  hideDelay = DEFAULT_HIDE_DELAY,
  onInfoChange,
}: HoverInfoProviderProps): React.ReactElement {
  const [internalInfoText, setInternalInfoText] = useState<string | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use external setter if provided, otherwise internal state
  const setInfoText = onInfoChange ?? setInternalInfoText;
  const infoText = onInfoChange ? null : internalInfoText; // External mode doesn't track state locally

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const showInfo = useCallback((text: string) => {
    cancelHide();
    setInfoText(text);
  }, [cancelHide, setInfoText]);

  const hideInfo = useCallback(() => {
    cancelHide();
    hideTimeoutRef.current = setTimeout(() => {
      setInfoText(null);
      hideTimeoutRef.current = null;
    }, hideDelay);
  }, [cancelHide, hideDelay, setInfoText]);

  return (
    <HoverInfoContext.Provider value={{ infoText, showInfo, hideInfo, cancelHide }}>
      {children}
    </HoverInfoContext.Provider>
  );
}

/**
 * Hook to access hover info context.
 * Must be used within a HoverInfoProvider.
 */
export function useHoverInfo(): HoverInfoContextValue {
  const context = useContext(HoverInfoContext);
  if (!context) {
    throw new Error('useHoverInfo must be used within a HoverInfoProvider');
  }
  return context;
}

/**
 * Hook that returns props to spread on an element for hover info behavior.
 * Handles mouseEnter/mouseLeave with proper hysteresis.
 */
export function useHoverInfoProps(text: string): {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
} {
  const { showInfo, hideInfo } = useHoverInfo();

  return {
    onMouseEnter: () => showInfo(text),
    onMouseLeave: hideInfo,
  };
}

interface HoverInfoFooterProps {
  /**
   * Test ID for the footer element
   */
  testId?: string;
}

/**
 * Footer component that displays the current hover info text.
 * Should be placed at the bottom of a panel/container.
 */
export function HoverInfoFooter({ testId }: HoverInfoFooterProps): React.ReactElement | null {
  const { infoText } = useHoverInfo();
  const colors = useThemeColors();

  return (
    <Box
      h="28px"
      px={4}
      py={1}
      borderTopWidth="1px"
      borderColor={colors.border}
      bg={colors.surfaceBg}
      flexShrink={0}
      data-testid={testId}
    >
      <Text
        fontSize="xs"
        color={colors.textMuted}
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
        opacity={infoText ? 1 : 0}
        transition="opacity 0.15s"
      >
        {infoText || '\u00A0'}
      </Text>
    </Box>
  );
}

interface HoverInfoTriggerProps {
  /**
   * Info text to display when hovering
   */
  info: string;

  /**
   * Children to wrap with hover behavior
   */
  children: React.ReactNode;

  /**
   * Whether to use inline display (span) instead of block (div)
   */
  inline?: boolean;
}

/**
 * Wrapper component that triggers hover info display for its children.
 * Use this to wrap any clickable element that should show info on hover.
 */
export function HoverInfoTrigger({
  info,
  children,
  inline = false,
}: HoverInfoTriggerProps): React.ReactElement {
  const hoverProps = useHoverInfoProps(info);
  const Component = inline ? 'span' : 'div';

  return (
    <Component {...hoverProps} style={{ display: inline ? 'inline' : 'contents' }}>
      {children}
    </Component>
  );
}
