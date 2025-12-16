/**
 * Theme Variable Sliders Component
 *
 * Provides sliders for adjusting theme generation parameters to create custom themes.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Switch,
  Slider,
  NativeSelect,
} from '@chakra-ui/react';
import { useThemeColors } from '../../themes/ThemeContext';
import type { ThemeGeneratorInput } from '../../themes/generator';
import type { FontFamily } from '../../themes/schema';

export interface ThemeVariableSlidersProps {
  /**
   * Initial values for the sliders (from current preset theme)
   */
  initialValues?: Partial<ThemeGeneratorInput>;

  /**
   * Callback when any slider value changes
   */
  onChange: (input: ThemeGeneratorInput) => void;

  /**
   * Whether the sliders are disabled
   */
  disabled?: boolean;
}

/**
 * Font family options for the dropdown
 */
const FONT_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'inter', label: 'Inter' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'source-sans', label: 'Source Sans' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
  { value: 'fira-code', label: 'Fira Code' },
];

/**
 * Default values for theme generation
 */
const DEFAULT_VALUES: ThemeGeneratorInput = {
  id: 'custom',
  name: 'Custom Theme',
  description: 'A custom theme created with sliders',
  baseHue: 210,
  secondaryHueOffset: 0,
  saturation: { min: 0.10, max: 0.40 },
  lightness: { min: 0.08, max: 0.97 },
  brightness: 'dark',
  colorFamily: 'blues',
  contrastFactor: 1.0,
  fontFamily: 'system',
  fontSizeFactor: 1.0,
};

/**
 * Individual slider with label and value display
 */
interface LabeledSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  formatValue?: (value: number) => string;
}

function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  formatValue = (v) => v.toString(),
}: LabeledSliderProps): React.ReactElement {
  const colors = useThemeColors();

  const handleValueChange = useCallback(
    (details: { value: number[] }) => {
      onChange(details.value[0]);
    },
    [onChange]
  );

  return (
    <Box width="100%">
      <HStack justify="space-between" mb={0}>
        <Text fontSize="xs" color={colors.textMuted}>
          {label}
        </Text>
        <Text fontSize="xs" color={colors.text} fontFamily="mono">
          {formatValue(value)}
        </Text>
      </HStack>
      <Slider.Root
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={handleValueChange}
        disabled={disabled}
        size="sm"
      >
        <Slider.Control>
          <Slider.Track height="4px">
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumb index={0} width="12px" height="12px">
            <Slider.HiddenInput />
          </Slider.Thumb>
        </Slider.Control>
      </Slider.Root>
    </Box>
  );
}

/**
 * Theme Variable Sliders Component
 */
function ThemeVariableSlidersComponent({
  initialValues,
  onChange,
  disabled = false,
}: ThemeVariableSlidersProps): React.ReactElement {
  const colors = useThemeColors();

  // Merge initial values with defaults
  const [values, setValues] = useState<ThemeGeneratorInput>(() => ({
    ...DEFAULT_VALUES,
    ...initialValues,
    saturation: {
      ...DEFAULT_VALUES.saturation,
      ...initialValues?.saturation,
    },
    lightness: {
      ...DEFAULT_VALUES.lightness,
      ...initialValues?.lightness,
    },
  }));

  // Update values when initialValues change (e.g., when cycling through presets)
  useEffect(() => {
    if (initialValues) {
      setValues((prev) => ({
        ...prev,
        ...initialValues,
        saturation: {
          ...prev.saturation,
          ...initialValues.saturation,
        },
        lightness: {
          ...prev.lightness,
          ...initialValues.lightness,
        },
      }));
    }
  }, [initialValues]);

  // Update a single value and notify parent
  const updateValue = useCallback(
    <K extends keyof ThemeGeneratorInput>(key: K, value: ThemeGeneratorInput[K]) => {
      setValues((prev) => {
        const updated = { ...prev, [key]: value };
        onChange(updated);
        return updated;
      });
    },
    [onChange]
  );

  // Update nested saturation values
  const updateSaturation = useCallback(
    (key: 'min' | 'max', value: number) => {
      setValues((prev) => {
        const updated = {
          ...prev,
          saturation: { ...prev.saturation, [key]: value },
        };
        onChange(updated);
        return updated;
      });
    },
    [onChange]
  );

  // Update nested lightness values
  const updateLightness = useCallback(
    (key: 'min' | 'max', value: number) => {
      setValues((prev) => {
        const updated = {
          ...prev,
          lightness: { ...prev.lightness, [key]: value },
        };
        onChange(updated);
        return updated;
      });
    },
    [onChange]
  );

  return (
    <Box
      bg={colors.surfaceBgSubtle}
      p={2}
      borderRadius="md"
      data-testid="theme-variable-sliders"
    >
      <VStack align="stretch" gap={2}>
        {/* Header with Brightness Toggle */}
        <HStack justify="space-between">
          <Text fontSize="xs" fontWeight="semibold" color={colors.text}>
            Theme Variables
          </Text>
          <HStack gap={2}>
            <Text fontSize="xs" color={colors.textMuted}>
              Dark
            </Text>
            <Switch.Root
              checked={values.brightness === 'light'}
              onCheckedChange={(details) => {
                updateValue('brightness', details.checked ? 'light' : 'dark');
              }}
              disabled={disabled}
              size="sm"
            >
              <Switch.HiddenInput />
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Root>
            <Text fontSize="xs" color={colors.textMuted}>
              Light
            </Text>
          </HStack>
        </HStack>

        {/* Single column layout - one parameter per row */}
        <LabeledSlider
          label="Base Hue"
          value={values.baseHue}
          min={0}
          max={360}
          step={1}
          onChange={(v) => updateValue('baseHue', v)}
          disabled={disabled}
          formatValue={(v) => `${v}°`}
        />

        <LabeledSlider
          label="Accent Offset"
          value={values.secondaryHueOffset}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => updateValue('secondaryHueOffset', v)}
          disabled={disabled}
          formatValue={(v) => `${v > 0 ? '+' : ''}${v}°`}
        />

        <LabeledSlider
          label="Saturation Min"
          value={values.saturation.min}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateSaturation('min', v)}
          disabled={disabled}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />

        <LabeledSlider
          label="Saturation Max"
          value={values.saturation.max}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateSaturation('max', v)}
          disabled={disabled}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />

        <LabeledSlider
          label="Lightness Min"
          value={values.lightness.min}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateLightness('min', v)}
          disabled={disabled}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />

        <LabeledSlider
          label="Lightness Max"
          value={values.lightness.max}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => updateLightness('max', v)}
          disabled={disabled}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />

        <LabeledSlider
          label="Contrast"
          value={values.contrastFactor}
          min={0.5}
          max={1.5}
          step={0.05}
          onChange={(v) => updateValue('contrastFactor', v)}
          disabled={disabled}
          formatValue={(v) => `${v.toFixed(2)}x`}
        />

        <LabeledSlider
          label="Font Size"
          value={values.fontSizeFactor ?? 1.0}
          min={0.5}
          max={1.5}
          step={0.05}
          onChange={(v) => updateValue('fontSizeFactor', v)}
          disabled={disabled}
          formatValue={(v) => `${v.toFixed(2)}x`}
        />

        {/* Font Family Selector */}
        <Box width="100%">
          <HStack justify="space-between" mb={0}>
            <Text fontSize="xs" color={colors.textMuted}>
              Font Family
            </Text>
          </HStack>
          <NativeSelect.Root size="xs" disabled={disabled}>
            <NativeSelect.Field
              value={values.fontFamily || 'system'}
              onChange={(e) => updateValue('fontFamily', e.target.value as FontFamily)}
              bg={colors.inputBg}
              borderColor={colors.border}
              color={colors.text}
              fontSize="xs"
            >
              {FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect.Field>
          </NativeSelect.Root>
        </Box>
      </VStack>
    </Box>
  );
}

export const ThemeVariableSliders = React.memo(
  ThemeVariableSlidersComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.disabled === nextProps.disabled &&
      prevProps.initialValues === nextProps.initialValues
    );
  }
);

ThemeVariableSliders.displayName = 'ThemeVariableSliders';
