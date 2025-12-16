/**
 * Theme Variable Sliders Component
 *
 * Provides sliders for adjusting theme generation parameters to create custom themes.
 * Features visual gradient tracks that show the effect of each parameter change.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Switch,
  Slider,
  IconButton,
} from '@chakra-ui/react';
import { useThemeColors } from '../../themes/ThemeContext';
import { oklchToHex } from '../../themes/generator/oklch';
import { FONT_FAMILY_PRESETS, type ThemeGeneratorInput } from '../../themes/generator';
import type { FontFamily } from '../../themes/schema';

/**
 * Gradient types for visual slider tracks
 */
type GradientType = 'hue' | 'accent' | 'saturation' | 'lightness' | 'none';

/**
 * Context for generating contextual gradients
 * Allows dependent sliders to show accurate previews based on parent values
 */
interface GradientContext {
  baseHue: number;
  saturationMin: number;
  saturationMax: number;
  lightnessMin: number;
  lightnessMax: number;
  brightness: 'light' | 'dark';
}

/**
 * Generate a CSS gradient string for the slider track
 */
function generateGradient(
  type: GradientType,
  context: GradientContext,
  variant?: 'min' | 'max'
): string {
  const stops: string[] = [];
  const numStops = 12;

  switch (type) {
    case 'hue': {
      // Full rainbow: 0° to 360°
      for (let i = 0; i <= numStops; i++) {
        const hue = (i / numStops) * 360;
        const color = oklchToHex({
          L: context.brightness === 'dark' ? 0.65 : 0.55,
          C: 0.15,
          H: hue,
        });
        stops.push(`${color} ${(i / numStops) * 100}%`);
      }
      break;
    }

    case 'accent': {
      // Rainbow shifted by base hue to show resulting accent
      for (let i = 0; i <= numStops; i++) {
        const offset = -180 + (i / numStops) * 360;
        const resultHue = (context.baseHue + offset + 360) % 360;
        const color = oklchToHex({
          L: context.brightness === 'dark' ? 0.65 : 0.55,
          C: 0.15,
          H: resultHue,
        });
        stops.push(`${color} ${(i / numStops) * 100}%`);
      }
      break;
    }

    case 'saturation': {
      // From desaturated to saturated at current hue
      const lightness = context.brightness === 'dark' ? 0.65 : 0.55;
      for (let i = 0; i <= numStops; i++) {
        const sat = i / numStops;
        // Map 0-1 to reasonable chroma (0 to 0.2)
        const chroma = sat * 0.2;
        const color = oklchToHex({
          L: lightness,
          C: chroma,
          H: context.baseHue,
        });
        stops.push(`${color} ${(i / numStops) * 100}%`);
      }
      break;
    }

    case 'lightness': {
      // From dark to light at current hue and saturation
      const midSat = (context.saturationMin + context.saturationMax) / 2;
      const chroma = midSat * 0.2;
      for (let i = 0; i <= numStops; i++) {
        const light = i / numStops;
        const color = oklchToHex({
          L: light,
          C: chroma,
          H: context.baseHue,
        });
        stops.push(`${color} ${(i / numStops) * 100}%`);
      }
      break;
    }

    default:
      return '';
  }

  return `linear-gradient(to right, ${stops.join(', ')})`;
}

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
 * Font family options for the toggle
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
 * Chevron Left Icon for font toggle
 */
function ChevronLeftIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  );
}

/**
 * Chevron Right Icon for font toggle
 */
function ChevronRightIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </svg>
  );
}

/**
 * Font Family Toggle Component
 * Displays current font with left/right arrows to cycle through options
 */
interface FontFamilyToggleProps {
  value: FontFamily;
  onChange: (value: FontFamily) => void;
  disabled?: boolean;
}

function FontFamilyToggle({ value, onChange, disabled }: FontFamilyToggleProps): React.ReactElement {
  const colors = useThemeColors();
  const currentIndex = FONT_OPTIONS.findIndex((opt) => opt.value === value);
  const currentOption = FONT_OPTIONS[currentIndex >= 0 ? currentIndex : 0];

  const handlePrevious = useCallback(() => {
    const prevIndex = (currentIndex - 1 + FONT_OPTIONS.length) % FONT_OPTIONS.length;
    onChange(FONT_OPTIONS[prevIndex].value);
  }, [currentIndex, onChange]);

  const handleNext = useCallback(() => {
    const nextIndex = (currentIndex + 1) % FONT_OPTIONS.length;
    onChange(FONT_OPTIONS[nextIndex].value);
  }, [currentIndex, onChange]);

  // Get the CSS font-family value for the current font to preview it
  const fontPreviewStyle = FONT_FAMILY_PRESETS[value]?.body || FONT_FAMILY_PRESETS.system.body;

  return (
    <Box width="100%">
      <Text fontSize="xs" color={colors.textMuted} mb={0}>
        Font Family
      </Text>
      <HStack justify="space-between" align="center" gap={1}>
        <IconButton
          aria-label="Previous font"
          onClick={handlePrevious}
          disabled={disabled}
          variant="ghost"
          size="xs"
          color={colors.text}
          opacity={disabled ? 0.5 : 1}
          cursor={disabled ? 'not-allowed' : 'pointer'}
        >
          <ChevronLeftIcon />
        </IconButton>
        <Text
          fontSize="sm"
          color={colors.text}
          textAlign="center"
          flex="1"
          fontFamily={fontPreviewStyle}
        >
          {currentOption.label}
        </Text>
        <IconButton
          aria-label="Next font"
          onClick={handleNext}
          disabled={disabled}
          variant="ghost"
          size="xs"
          color={colors.text}
          opacity={disabled ? 0.5 : 1}
          cursor={disabled ? 'not-allowed' : 'pointer'}
        >
          <ChevronRightIcon />
        </IconButton>
      </HStack>
    </Box>
  );
}

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
 * Individual slider with label, value display, and optional gradient track
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
  /** CSS gradient string for the track background */
  gradient?: string;
  /** Current color preview (shown as a swatch next to the value) */
  currentColor?: string;
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
  gradient,
  currentColor,
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
        <HStack gap={1}>
          {currentColor && (
            <Box
              width="12px"
              height="12px"
              borderRadius="2px"
              bg={currentColor}
              border="1px solid"
              borderColor={colors.border}
              flexShrink={0}
            />
          )}
          <Text fontSize="xs" color={colors.text} fontFamily="mono">
            {formatValue(value)}
          </Text>
        </HStack>
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
          <Slider.Track
            height="8px"
            borderRadius="4px"
            overflow="hidden"
            style={
              gradient
                ? {
                    background: gradient,
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
                  }
                : undefined
            }
          >
            {/* Only show range fill if no gradient */}
            {!gradient && <Slider.Range />}
          </Slider.Track>
          <Slider.Thumb
            index={0}
            width="14px"
            height="14px"
            style={{
              boxShadow: '0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
              border: '2px solid white',
              background: currentColor || colors.buttonPrimaryBg,
            }}
          >
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

  // Build gradient context from current values
  const gradientContext: GradientContext = useMemo(
    () => ({
      baseHue: values.baseHue,
      saturationMin: values.saturation.min,
      saturationMax: values.saturation.max,
      lightnessMin: values.lightness.min,
      lightnessMax: values.lightness.max,
      brightness: values.brightness,
    }),
    [values.baseHue, values.saturation, values.lightness, values.brightness]
  );

  // Pre-compute gradients for all color sliders
  const gradients = useMemo(
    () => ({
      hue: generateGradient('hue', gradientContext),
      accent: generateGradient('accent', gradientContext),
      saturation: generateGradient('saturation', gradientContext),
      lightness: generateGradient('lightness', gradientContext),
    }),
    [gradientContext]
  );

  // Compute current color previews for each slider's thumb
  const currentColors = useMemo(() => {
    const baseLightness = values.brightness === 'dark' ? 0.65 : 0.55;
    const midSat = (values.saturation.min + values.saturation.max) / 2;

    return {
      baseHue: oklchToHex({
        L: baseLightness,
        C: 0.15,
        H: values.baseHue,
      }),
      accent: oklchToHex({
        L: baseLightness,
        C: 0.15,
        H: (values.baseHue + values.secondaryHueOffset + 360) % 360,
      }),
      saturationMin: oklchToHex({
        L: baseLightness,
        C: values.saturation.min * 0.2,
        H: values.baseHue,
      }),
      saturationMax: oklchToHex({
        L: baseLightness,
        C: values.saturation.max * 0.2,
        H: values.baseHue,
      }),
      lightnessMin: oklchToHex({
        L: values.lightness.min,
        C: midSat * 0.2,
        H: values.baseHue,
      }),
      lightnessMax: oklchToHex({
        L: values.lightness.max,
        C: midSat * 0.2,
        H: values.baseHue,
      }),
    };
  }, [values]);

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

        {/* Color sliders with visual gradient tracks */}
        <LabeledSlider
          label="Base Hue"
          value={values.baseHue}
          min={0}
          max={360}
          step={1}
          onChange={(v) => updateValue('baseHue', v)}
          disabled={disabled}
          formatValue={(v) => `${v}°`}
          gradient={gradients.hue}
          currentColor={currentColors.baseHue}
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
          gradient={gradients.accent}
          currentColor={currentColors.accent}
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
          gradient={gradients.saturation}
          currentColor={currentColors.saturationMin}
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
          gradient={gradients.saturation}
          currentColor={currentColors.saturationMax}
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
          gradient={gradients.lightness}
          currentColor={currentColors.lightnessMin}
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
          gradient={gradients.lightness}
          currentColor={currentColors.lightnessMax}
        />

        {/* Non-color sliders without gradients */}
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

        {/* Font Family Toggle */}
        <FontFamilyToggle
          value={values.fontFamily || 'system'}
          onChange={(v) => updateValue('fontFamily', v)}
          disabled={disabled}
        />
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
