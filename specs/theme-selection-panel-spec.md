# Theme Selection Panel - Requirements Specification

## Problem Statement

The current theme selection interface is a simple dropdown menu that only shows theme names with small color swatches. Users cannot effectively preview what a theme will look like before selecting it, leading to trial-and-error theme selection. This creates friction in the theming experience and doesn't showcase the visual distinctiveness of each theme.

This feature replaces the dropdown with a dedicated theme selection panel that provides:
- Visual preview of how the selected theme looks in the actual application
- Interactive carousel to browse through themes
- Filtering options to narrow down theme choices
- Staging mode where users can preview before committing

## Core Functionality

A modal panel that allows users to:
1. Browse through all available themes via a carousel interface
2. See a live, scaled-down preview of the application with each theme applied
3. Filter themes by brightness (Light/Dark) and color family
4. Stage a theme selection, preview it, then apply with OK or cancel to revert
5. Navigate themes using arrow buttons and keyboard controls

## Functional Requirements

### FR1: Panel Triggering
- **Behavior**: Replace the current "Theme" dropdown menu item in the hamburger menu with a button that opens the theme selection panel
- **Acceptance**: Clicking "Theme" in hamburger menu opens the ThemeSelectionPanel modal instead of showing dropdown

### FR2: Live Carousel Preview
- **Behavior**: Display a single, scaled-down preview of the application showing how the currently browsed theme looks
- **Preview Content**: Full detail showing all major areas - header, sidebar, conversation pane, footer
- **Preview Technology**: Render actual React components (Header, Sidebar, Footer, etc.) at a smaller scale with the browsed theme applied
- **Acceptance**: Preview accurately reflects the theme's semantic colors (appBg, surfaceBg, text, borders, etc.)

### FR3: Carousel Navigation
- **Arrow Buttons**: Left/right arrow buttons to navigate to previous/next theme
- **Keyboard Support**: Left/right arrow keys cycle through themes
- **Wrap-around**: Carousel wraps from last theme to first and vice versa
- **Current Theme Indicator**: Clear indication of which theme is currently being previewed in carousel
- **Acceptance**: User can navigate through all themes using both mouse and keyboard

### FR4: Theme Filtering
- **Light/Dark Toggle**: Button/toggle to filter between light themes (light) and dark themes (dark + 8 color variants)
- **Color Family Filters**: Buttons to filter by color families:
  - All (no filter)
  - Blues (light, dark, ocean, twilight)
  - Greens (forest, mint)
  - Warm (sunset, ember, amber)
  - Purple (purple-haze)
- **Filter Behavior**: When filter active, carousel only shows themes matching the filter
- **Filter Persistence**: Filters remain active while panel is open, reset when panel is closed
- **Acceptance**: Applying filters reduces carousel to only matching themes

### FR5: Staging Mode (Apply on OK)
- **Initial State**: Panel opens showing the currently active theme
- **Preview State**: User navigates carousel; theme preview updates but does NOT apply to main app
- **Apply**: Clicking "OK" button applies the currently previewed theme and closes panel
- **Cancel**: Clicking "Cancel" button reverts to the original theme and closes panel
- **Original Theme Tracking**: Panel remembers which theme was active when opened
- **Acceptance**: Theme only persists to database when OK is clicked; Cancel reverts any preview changes

### FR6: Panel Layout
- **Structure**: Modal dialog with:
  - Header: "Select Theme"
  - Body:
    - Filter buttons (top)
    - Carousel navigation (left arrow, preview area, right arrow)
    - Theme name and description below preview
  - Footer: Cancel and OK buttons
- **Responsive Sizing**: Panel should be large enough to show preview clearly but not overwhelm the screen
- **Acceptance**: Layout is clear, preview is recognizable, controls are accessible

### FR7: Theme Information Display
- **Theme Name**: Display name of currently previewed theme (e.g., "Dark", "Ocean", "Sunset")
- **Theme Description**: Display theme description (e.g., "Cool blue-teal aquatic theme")
- **Current Theme Badge**: Visual indicator if the previewed theme is the currently active theme
- **Acceptance**: User can identify which theme they're previewing and whether it's already active

## Critical Constraints

### C1: Per-Identity Theme Persistence
- Theme selection must continue to be stored per-identity in the `nostr_identities.theme` column
- Panel only available when an identity is selected (consistent with current behavior)
- Theme persists via existing IPC mechanism: `window.api.nostling.identities.updateTheme()`

### C2: Theme System Compatibility
- Must use existing theme registry (`THEME_REGISTRY` in `src/renderer/themes/definitions.ts`)
- All 10 themes must be supported: light, dark, sunset, ocean, forest, purple-haze, ember, twilight, mint, amber
- Must use semantic colors from `ThemeSemanticColors` interface
- Preview must use actual Chakra UI theme system (`createThemeSystem()`)

### C3: Existing Theme Infrastructure
- Do NOT modify theme definitions or theme application logic
- Reuse existing `ThemeProvider` and `useThemeColors()` hooks for preview rendering
- Panel is purely a UI enhancement; backend theme logic unchanged

### C4: Accessibility
- Panel must be keyboard navigable (Tab, Enter, Escape, Arrow keys)
- Must follow Chakra UI Dialog patterns for proper focus management
- Close on Escape key press
- Cannot close modal during theme application (loading state)

### C5: Performance
- Preview rendering must not impact main app performance
- Carousel transitions should be smooth (60fps target)
- Theme preview updates should be near-instantaneous (<100ms)

## Integration Points

### I1: Hamburger Menu Integration
- **Current**: `ThemeSelector` component in hamburger menu at `src/renderer/main.tsx` lines 272-334
- **Change**: Replace `ThemeSelector` with button/item that opens `ThemeSelectionPanel`
- **Props Needed**: `currentTheme`, `identityId`, `onThemeChange`

### I2: Theme Context Integration
- **Preview Rendering**: Create isolated `ThemeProvider` context for preview area
- **Current App Theme**: Continue using root-level `ThemeProvider` for main app
- **Separation**: Preview theme changes must NOT affect main app until OK clicked

### I3: Theme Persistence Layer
- **Existing**: `updateIdentityTheme()` in `src/main/nostling/update-identity-theme.ts`
- **IPC Handler**: `window.api.nostling.identities.updateTheme(identityId, themeId)`
- **Behavior**: Call IPC handler only when OK clicked, not during preview navigation

### I4: Component Reuse for Preview
- **Components to Render**: Header, Sidebar, Footer, ConversationPane (or mockups thereof)
- **Scaling**: Use CSS transform scale or reduced padding/sizes
- **Data**: Use mock/placeholder data for preview (no real identities/contacts needed)

## User Preferences

### UP1: Visual Preview Approach
- User prefers live, scaled-down React components over static mockups
- Preview should show full application layout at smaller scale
- All major UI areas should be recognizable in preview

### UP2: Carousel Over Grid
- User prefers single large preview with carousel navigation over grid of small previews
- One theme visible at a time for focused evaluation

### UP3: Filtering for Efficient Browsing
- User wants Light/Dark toggle to quickly narrow brightness preference
- User wants color family filters to find themes by color scheme

### UP4: Staging Mode
- User wants to preview themes before committing (staging mode)
- OK/Cancel workflow prevents accidental theme application

## Codebase Context

### Existing Theme System
- **Theme Registry**: `THEME_REGISTRY` in `src/renderer/themes/definitions.ts` defines all 10 themes
- **Theme Metadata**: Each theme has `metadata` (name, description, previewColors), `config` (Chakra), `semanticColors`
- **Theme Functions**:
  - `getAllThemes()`: Returns array of `ThemeMetadata` for all themes in order
  - `getTheme(themeId)`: Returns `ThemeDefinition` with fallback to 'dark'
  - `isValidThemeId(themeId)`: Type-safe validation

### Current Theme Selection
- **Component**: `ThemeSelector` in `src/renderer/components/ThemeSelector.tsx`
- **Location**: Hamburger menu in app header
- **Pattern**: Chakra `Menu.Root` with `Menu.Item` per theme
- **Features**: Theme swatches, checkmark for current theme, loading state, error handling
- **Callback**: `onThemeChange: (themeId: ThemeId) => Promise<void>`

### Modal Patterns
- **Standard Structure**: `Dialog.Root` > `Dialog.Backdrop` > `Dialog.Positioner` > `Dialog.Content`
- **Content Areas**: `Dialog.Header`, `Dialog.Body`, `Dialog.Footer`, `Dialog.CloseTrigger`
- **Close Behavior**: `onOpenChange={(e) => !e.open && onClose()}`
- **Examples**: `IdentityModal`, `ContactModal`, `DeleteContactDialog` in `src/renderer/main.tsx`
- **Buttons**: Primary action (`colorPalette="blue"`), Cancel (`variant="ghost"`), loading states

### Theme Application Flow
```
User opens panel → Browse themes (preview updates) → Click OK →
  Call onThemeChange(selectedThemeId) →
  IPC: updateIdentityTheme(identityId, themeId) →
  Database update →
  Local state update →
  Main app re-renders with new theme
```

### Testing Patterns
- **Property-Based Tests**: Use `fast-check` for comprehensive coverage (label tests P###)
- **Example-Based Tests**: Critical cases and edge cases (label tests E###)
- **Component Tests**: Create React elements without rendering for prop validation
- **E2E Tests**: Playwright tests using `data-testid` selectors
- **E2E Helpers**: `waitForAppReady()`, `ensureIdentityExists()`, `selectTheme()` helper
- **Visual Verification**: `window.getComputedStyle()` for color verification
- **Test Organization**: Describe blocks by feature area, separate properties/examples/regressions

## Out of Scope

### OS1: Theme Creation/Editing
- This feature does NOT allow users to create custom themes
- Users can only select from the existing 10 themes in the registry

### OS2: Theme Customization
- No ability to modify individual colors within a theme
- No color picker or customization UI

### OS3: Theme Synchronization Across Identities
- Each identity keeps its own theme preference
- No global default theme or theme inheritance

### OS4: Favorite/Starred Themes
- While mentioned in clarification, not required for initial implementation
- Filter system provides adequate organization

### OS5: Theme Recommendations
- No AI/automatic theme suggestions based on time of day, content, etc.
- User manually selects theme

### OS6: Animated Transitions in Preview
- Preview shows static representation of theme
- No animations showing theme transitions or special effects

### OS7: Theme Sharing/Export
- No ability to share theme preferences with others
- No export/import of theme settings

---

**Note**: This is a requirements specification, not an architecture design. The `integration-architect` will determine:
- Component structure for ThemeSelectionPanel
- State management approach (local state vs context)
- Preview rendering strategy (isolation techniques)
- Carousel implementation (library vs custom)
- Filter UI layout and state coordination
- Specific component breakdown and file organization
- Error handling strategies
- Loading state management during theme application
