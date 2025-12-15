/**
 * Theme Carousel Component
 *
 * Provides carousel navigation (left/right arrows) and theme preview display.
 */

import React from 'react';
import { Box, HStack, IconButton } from '@chakra-ui/react';
import { ThemeMetadata, ThemeId } from '../../themes/definitions';
import { ThemePreview } from './ThemePreview';
import { useThemeColors } from '../../themes/ThemeContext';

export interface ThemeCarouselProps {
  /**
   * Currently displayed theme in carousel
   */
  currentTheme: ThemeId;

  /**
   * Filtered list of available themes to navigate through
   */
  availableThemes: ThemeMetadata[];

  /**
   * Callback when user navigates to different theme
   */
  onThemeChange: (themeId: ThemeId) => void;

  /**
   * When true, carousel navigation is disabled (buttons and keyboard)
   * Used during async theme application to prevent race conditions
   */
  disabled?: boolean;
}

/**
 * Chevron Left Icon
 */
function ChevronLeftIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  );
}

/**
 * Chevron Right Icon
 */
function ChevronRightIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </svg>
  );
}

/**
 * Theme Carousel Component
 *
 * CONTRACT:
 *   Inputs:
 *     - currentTheme: ThemeId of theme currently displayed in preview
 *     - availableThemes: collection of ThemeMetadata objects (filtered list), non-empty
 *     - onThemeChange: callback function receiving ThemeId when navigation occurs
 *
 *   Outputs:
 *     - React element containing:
 *       * Left arrow button
 *       * Theme preview in center
 *       * Right arrow button
 *       * Navigation wraps around (last → first, first → last)
 *
 *   Invariants:
 *     - Preview always shows theme matching currentTheme
 *     - Left button navigates to previous theme in availableThemes list
 *     - Right button navigates to next theme in availableThemes list
 *     - Navigation wraps: from first theme, left goes to last; from last, right goes to first
 *     - Both buttons always enabled (wrap-around ensures always valid navigation)
 *     - Clicking button calls onThemeChange with new theme ID
 *
 *   Properties:
 *     - Wrap-around: for list of N themes, clicking right N times returns to original theme
 *     - Reversibility: right then left returns to original theme (and vice versa)
 *     - Accessibility: buttons keyboard navigable, proper ARIA labels
 *     - Visual feedback: buttons have hover states
 *
 *   Algorithm:
 *     Left button click:
 *       1. Find current theme index in availableThemes list
 *       2. Calculate previous index: (currentIndex - 1 + length) mod length
 *       3. Call onThemeChange with theme at previous index
 *
 *     Right button click:
 *       1. Find current theme index in availableThemes list
 *       2. Calculate next index: (currentIndex + 1) mod length
 *       3. Call onThemeChange with theme at next index
 *
 *     Preview:
 *       1. Render ThemePreview component with currentTheme
 */
function ThemeCarouselComponent({
  currentTheme,
  availableThemes,
  onThemeChange,
  disabled = false,
}: ThemeCarouselProps): React.ReactElement {
  const colors = useThemeColors();

  const handleNavigatePrevious = (): void => {
    if (disabled) return;
    const currentIndex = availableThemes.findIndex((theme) => theme.id === currentTheme);
    const previousIndex = (currentIndex - 1 + availableThemes.length) % availableThemes.length;
    onThemeChange(availableThemes[previousIndex].id);
  };

  const handleNavigateNext = (): void => {
    if (disabled) return;
    const currentIndex = availableThemes.findIndex((theme) => theme.id === currentTheme);
    const nextIndex = (currentIndex + 1) % availableThemes.length;
    onThemeChange(availableThemes[nextIndex].id);
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (disabled) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      handleNavigatePrevious();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      handleNavigateNext();
    }
  };

  return (
    <HStack
      gap={4}
      justify="center"
      align="center"
      onKeyDown={handleKeyDown}
      data-testid="theme-carousel"
    >
      <IconButton
        aria-label="Previous theme"
        onClick={handleNavigatePrevious}
        data-testid="theme-carousel-previous"
        variant="ghost"
        size="lg"
        disabled={disabled}
        opacity={disabled ? 0.5 : 1}
        cursor={disabled ? 'not-allowed' : 'pointer'}
      >
        <ChevronLeftIcon />
      </IconButton>
      <ThemePreview themeId={currentTheme} />
      <IconButton
        aria-label="Next theme"
        onClick={handleNavigateNext}
        data-testid="theme-carousel-next"
        variant="ghost"
        size="lg"
        disabled={disabled}
        opacity={disabled ? 0.5 : 1}
        cursor={disabled ? 'not-allowed' : 'pointer'}
      >
        <ChevronRightIcon />
      </IconButton>
    </HStack>
  );
}

export const ThemeCarousel = React.memo(
  ThemeCarouselComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.currentTheme === nextProps.currentTheme &&
      prevProps.availableThemes === nextProps.availableThemes &&
      prevProps.disabled === nextProps.disabled
    );
  }
);

ThemeCarousel.displayName = 'ThemeCarousel';
