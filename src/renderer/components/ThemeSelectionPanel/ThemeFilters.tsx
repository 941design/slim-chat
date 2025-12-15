/**
 * Theme Filters Component
 *
 * Provides brightness and color family filter controls for theme selection.
 */

import React from 'react';
import { Button, HStack, VStack, Text } from '@chakra-ui/react';
import { ThemeFilters as ThemeFiltersType } from './types';
import { useThemeColors } from '../../themes/ThemeContext';

export interface ThemeFiltersProps {
  /**
   * Current filter state
   */
  filters: ThemeFiltersType;

  /**
   * Callback when filters change
   */
  onFilterChange: (filters: ThemeFiltersType) => void;

  /**
   * When true, filter buttons are disabled (used during async theme application)
   */
  disabled?: boolean;
}

/**
 * Theme Filters Component
 *
 * CONTRACT:
 *   Inputs:
 *     - filters: current ThemeFilters state object
 *     - onFilterChange: callback function receiving new ThemeFilters state
 *
 *   Outputs:
 *     - React element containing:
 *       * Brightness toggle buttons (All/Light/Dark)
 *       * Color family filter buttons (All/Blues/Greens/Warm/Purple)
 *       * Visual indication of active filters
 *
 *   Invariants:
 *     - Exactly one brightness filter is active at any time
 *     - Exactly one color family filter is active at any time
 *     - Active filter buttons are visually distinct (highlighted)
 *     - Clicking active filter has no effect (no-op)
 *     - Clicking inactive filter calls onFilterChange with updated filters
 *
 *   Properties:
 *     - Idempotent clicks: clicking active filter multiple times doesn't trigger onFilterChange
 *     - Single responsibility: each button controls only its own filter dimension
 *     - Immediate feedback: active state updates immediately when filters prop changes
 *     - Accessible: keyboard navigable, clear labels, ARIA attributes
 *
 *   Algorithm:
 *     Brightness buttons:
 *       1. Render three buttons: All, Light, Dark
 *       2. Highlight button matching filters.brightness
 *       3. On click: call onFilterChange with new brightness, preserve colorFamily
 *
 *     Color family buttons:
 *       1. Render five buttons: All, Blues, Greens, Warm, Purple
 *       2. Highlight button matching filters.colorFamily
 *       3. On click: call onFilterChange with new colorFamily, preserve brightness
 */
function ThemeFiltersComponent({
  filters,
  onFilterChange,
  disabled = false,
}: ThemeFiltersProps): React.ReactElement {
  const colors = useThemeColors();

  const brightnessOptions: Array<{ value: 'all' | 'light' | 'dark'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  const colorFamilyOptions: Array<{ value: 'all' | 'blues' | 'greens' | 'warm' | 'purple'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'blues', label: 'Blues' },
    { value: 'greens', label: 'Greens' },
    { value: 'warm', label: 'Warm' },
    { value: 'purple', label: 'Purple' },
  ];

  const handleBrightnessClick = (value: 'all' | 'light' | 'dark') => {
    if (!disabled && filters.brightness !== value) {
      onFilterChange({ ...filters, brightness: value });
    }
  };

  const handleColorFamilyClick = (value: 'all' | 'blues' | 'greens' | 'warm' | 'purple') => {
    if (!disabled && filters.colorFamily !== value) {
      onFilterChange({ ...filters, colorFamily: value });
    }
  };

  return (
    <VStack align="stretch" gap={3}>
      <Text fontSize="sm" fontWeight="semibold" color={colors.text}>
        Filters
      </Text>

      <VStack align="stretch" gap={2}>
        <Text fontSize="xs" color={colors.textMuted}>
          Brightness
        </Text>
        <HStack gap={2}>
          {brightnessOptions.map(({ value, label }) => (
            <Button
              key={`brightness-${value}`}
              data-testid={`filter-brightness-${value}`}
              variant={filters.brightness === value ? 'solid' : 'outline'}
              size="sm"
              onClick={() => handleBrightnessClick(value)}
              aria-label={`Filter by brightness: ${label}`}
              aria-pressed={filters.brightness === value}
              disabled={disabled}
              opacity={disabled ? 0.5 : 1}
              cursor={disabled ? 'not-allowed' : 'pointer'}
            >
              {label}
            </Button>
          ))}
        </HStack>
      </VStack>

      <VStack align="stretch" gap={2}>
        <Text fontSize="xs" color={colors.textMuted}>
          Color Family
        </Text>
        <HStack gap={2} flexWrap="wrap">
          {colorFamilyOptions.map(({ value, label }) => (
            <Button
              key={`color-${value}`}
              data-testid={`filter-color-${value}`}
              variant={filters.colorFamily === value ? 'solid' : 'outline'}
              size="sm"
              onClick={() => handleColorFamilyClick(value)}
              aria-label={`Filter by color: ${label}`}
              aria-pressed={filters.colorFamily === value}
              disabled={disabled}
              opacity={disabled ? 0.5 : 1}
              cursor={disabled ? 'not-allowed' : 'pointer'}
            >
              {label}
            </Button>
          ))}
        </HStack>
      </VStack>
    </VStack>
  );
}

export const ThemeFilters = React.memo(
  ThemeFiltersComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.filters === nextProps.filters &&
      prevProps.disabled === nextProps.disabled
    );
  }
);

ThemeFilters.displayName = 'ThemeFilters';
