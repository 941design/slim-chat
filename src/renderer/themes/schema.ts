/**
 * Theme Schema
 *
 * TypeScript interfaces for JSON theme files.
 * Themes can extend a parent theme (defaults to 'default') and only override what differs.
 */

/**
 * Theme identifier - all available themes (algorithmically generated)
 */
export type ThemeId =
  // Light themes
  | 'mist'
  | 'dawn'
  | 'cloud'
  | 'blossom'
  | 'meadow'
  // Dark themes - blues/cyans
  | 'obsidian'
  | 'sapphire'
  | 'ocean'
  | 'arctic'
  | 'storm'
  // Dark themes - greens
  | 'forest'
  | 'jade'
  | 'matrix'
  // Dark themes - warm
  | 'ember'
  | 'copper'
  | 'sunset'
  | 'mocha'
  // Dark themes - purple/pink
  | 'amethyst'
  | 'twilight'
  | 'rose';

/**
 * Color family for theme filtering
 */
export type ColorFamily = 'blues' | 'greens' | 'warm' | 'purple' | 'pink' | 'neutral';

/**
 * Theme brightness for filtering
 */
export type ThemeBrightness = 'light' | 'dark';

/**
 * Available font families for themes
 */
export type FontFamily = 'system' | 'inter' | 'roboto' | 'source-sans' | 'jetbrains-mono' | 'fira-code';

/**
 * Theme metadata for UI display and filtering
 */
export interface ThemeMetadata {
  colorFamily: ColorFamily;
  brightness: ThemeBrightness;
  author?: string;
  version?: string;
}

/**
 * Brand color palette (Chakra UI scale)
 */
export interface BrandColors {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}

/**
 * Semantic color tokens - the complete set used throughout the app
 */
export interface SemanticColors {
  // Backgrounds
  appBg: string;
  surfaceBg: string;
  surfaceBgSubtle: string;
  surfaceBgSelected: string;
  menuBg: string;

  // Borders
  border: string;
  borderSubtle: string;

  // Text
  text: string;
  textMuted: string;
  textSubtle: string;

  // Status indicators
  statusSuccess: string;
  statusWarning: string;
  statusError: string;
  statusInfo: string;

  // Primary button
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonPrimaryHover: string;

  // Secondary button
  buttonSecondaryBg: string;
  buttonSecondaryText: string;
  buttonSecondaryHover: string;

  // Danger button
  buttonDangerBg: string;
  buttonDangerText: string;
  buttonDangerHover: string;

  // Inputs
  inputBg: string;
  inputBorder: string;
  inputFocus: string;

  // Links
  link: string;
  linkHover: string;

  // Own message bubble (user's outgoing messages)
  ownBubbleBg: string;
  ownBubbleBorder: string;
  ownBubbleText: string;
}

/**
 * Preview colors for theme selection UI
 */
export interface PreviewColors {
  primary: string;
  background: string;
  text: string;
}

/**
 * Typography configuration
 */
export interface Typography {
  fonts?: {
    body?: string;
    heading?: string;
    mono?: string;
  };
  fontSizes?: {
    xs?: string;
    sm?: string;
    md?: string;
    lg?: string;
    xl?: string;
    '2xl'?: string;
    '3xl'?: string;
    '4xl'?: string;
  };
  fontWeights?: {
    normal?: number;
    medium?: number;
    semibold?: number;
    bold?: number;
  };
  lineHeights?: {
    tight?: string;
    normal?: string;
    relaxed?: string;
  };
}

/**
 * Border radius configuration
 */
export interface Radii {
  none?: string;
  sm?: string;
  md?: string;
  lg?: string;
  xl?: string;
  full?: string;
}

/**
 * Shadow configuration
 */
export interface Shadows {
  none?: string;
  sm?: string;
  md?: string;
  lg?: string;
  xl?: string;
  inner?: string;
}

/**
 * JSON theme file structure
 * Themes can extend a parent theme and only override what differs
 */
export interface ThemeJSON {
  id: string;
  name: string;
  description: string;
  extends?: string; // Parent theme ID (defaults to 'default')
  metadata: ThemeMetadata;
  colors: {
    brand?: Partial<BrandColors>;
    semantic?: Partial<SemanticColors>;
    previewColors: PreviewColors;
  };
  typography?: Typography;
  radii?: Radii;
  shadows?: Shadows;
}

/**
 * Resolved theme with all values filled in (after inheritance resolution)
 */
export interface ResolvedTheme {
  id: ThemeId;
  name: string;
  description: string;
  metadata: ThemeMetadata;
  colors: {
    brand: BrandColors;
    semantic: SemanticColors;
    previewColors: PreviewColors;
  };
  typography: Required<Typography>;
  radii: Required<Radii>;
  shadows: Required<Shadows>;
}
