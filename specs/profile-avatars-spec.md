# Profile Avatars with Status Badges - Requirements Specification

## Problem Statement

The backend for private (NIP-59 wrapped) profiles has been implemented, but there are no frontend visual components to display profile information. Users currently see only text-based display names for identities and contacts, with no visual indication of:
- Whether a profile image exists
- Whether the displayed information comes from a private profile, public profile, or alias override

This creates a poor user experience where profile status and images are invisible despite being available in the backend.

## Core Functionality

Add avatar/icon components with status badge overlays to visually represent:
1. **Profile images** when available (from `ProfileContent.picture`)
2. **Default letter circle** showing first letter of display name when no image
3. **Status badge** indicating profile type:
   - VerifiedUser icon = private profile available
   - GppMaybe icon = public profile displayed
   - GppBad icon = no profile (alias/npub fallback)

## Functional Requirements

### FR1: Avatar Component
**Requirement**: Create a reusable Avatar component that displays profile information
- **Default state**: Circular avatar with first letter of display name
- **With image**: Display profile picture from `ProfileContent.picture` URL
- **Image fallback**: If image fails to load, fall back to letter circle
- **Size**: 32px diameter (medium)
- **Letter extraction**: Use first character of resolved display name (from `getPreferredDisplayName()`)

**Acceptance Criteria**:
- Avatar renders as perfect circle
- Letter is centered and uppercase
- Letter uses semantic colors from theme
- Image maintains aspect ratio and is circular-cropped
- Failed images gracefully fall back to letter circle

### FR2: Status Badge Overlay
**Requirement**: Display profile status as icon badge overlaying avatar
- **Position**: Top-right corner of avatar circle
- **Icons**: Custom SVG icons following existing pattern (qr-icons.tsx, main.tsx)
  - ShieldCheckIcon (verified/lock concept) = private profile
  - ShieldWarningIcon (partial shield) = public profile
  - ShieldOffIcon (broken shield) = no profile
- **Size**: Approximately 40% of avatar size (~12px at 32px avatar)
- **Styling**: Icon with contrasting background circle for visibility

**Acceptance Criteria**:
- Badge is clearly visible over avatar
- Badge doesn't obscure entire avatar
- Badge icons are semantically meaningful
- Icons follow existing SVG pattern (viewBox="0 0 24 24", width="1em", height="1em")

### FR3: Profile Status Detection
**Requirement**: Query backend to determine which type of profile is active
- **For identities**: Check `nostr_profiles` table with `source='private_authored'` OR `source='public_discovered'`
- **For contacts**: Check `nostr_profiles` table with `source='private_received'` OR `source='public_discovered'`
- **Status logic**:
  - If private profile exists → ShieldCheckIcon
  - Else if public profile exists → ShieldWarningIcon
  - Else → ShieldOffIcon

**Acceptance Criteria**:
- Backend query returns profile source information
- Frontend correctly interprets source to determine badge icon
- Status updates when profile changes

### FR4: Integration Points
**Requirement**: Display avatars in all locations where identities/contacts are shown

**Locations**:
1. **Identity list items** (IdentityList component, lines 629-788)
   - Avatar to the left of identity name
   - Badge indicates identity's own profile status (private_authored or public_discovered)

2. **Contact list items** (ContactList component, lines 879-1046)
   - Avatar to the left of contact name
   - Badge indicates contact's shared profile status (private_received or public_discovered)

3. **Conversation pane header** (ConversationPane component)
   - Avatar for the selected contact
   - Larger size may be appropriate for header

4. **Message list items** (message rendering in conversation)
   - Small avatar next to each message
   - Differentiate between incoming (contact's avatar) and outgoing (identity's avatar)

**Acceptance Criteria**:
- Avatars display consistently across all locations
- Avatar presence doesn't break existing layouts
- List items accommodate avatar without excessive height increase
- Avatars are clickable where appropriate (don't interfere with existing click handlers)

### FR5: Backend API Extension
**Requirement**: Expose profile status through IPC or state management

**Options**:
1. Extend existing `NostlingIdentity` and `NostlingContact` types with `profileSource` field
2. Add new IPC handlers: `nostling:profiles:getStatus(pubkey)` → `{source: ProfileSource | null, picture?: string}`
3. Populate profile data in existing list queries

**Acceptance Criteria**:
- Frontend can efficiently determine profile status without N+1 queries
- Profile picture URLs are available when rendering avatars
- Solution integrates cleanly with existing state management

## Critical Constraints

### C1: UI Framework Consistency
- **Must use Chakra UI** (project's UI library)
- **Must NOT use Material-UI** components
- Icons must be custom SVG following existing pattern in `src/renderer/components/qr-icons.tsx`

### C2: Performance
- Avatar images must not block UI rendering
- Profile status queries must be efficient (batch or cached)
- Failed image loads must not cause visible flashing/jumping

### C3: Accessibility
- Avatar must have appropriate alt text
- Badge icons must have aria-label or title attributes
- Color must not be the only indicator (icon shape also matters)

### C4: Theme Compatibility
- Avatar and badge must work with all themes (light/dark)
- Letter circles must use semantic theme colors
- Badge background must provide sufficient contrast

## Integration Points

### Existing Code to Integrate With:

1. **Display Name Resolution** (`src/renderer/utils/sidebar.ts:6-18`)
   - `getPreferredDisplayName()` provides the name for letter extraction
   - Already implements precedence: profileName > alias > npub

2. **Profile Types** (`src/shared/profile-types.ts`)
   - `ProfileSource` type defines 'private_received' | 'public_discovered' | 'private_authored'
   - `ProfileContent.picture` contains image URL

3. **Identity/Contact Lists** (`src/renderer/main.tsx`)
   - Lines 629-788: IdentityList component
   - Lines 879-1046: ContactList component
   - Both use HStack layout with Text showing displayName

4. **Icon Pattern** (`src/renderer/components/qr-icons.tsx`)
   - Custom SVG icons with viewBox="0 0 24 24"
   - Simple functional components returning SVG elements

5. **Theme System** (`src/renderer/themes/ThemeContext.tsx`)
   - `useThemeColors()` hook provides semantic colors
   - Use `colors.text`, `colors.border`, `colors.surfaceBg`, etc.

## User Preferences

- **Icon library**: Use same custom SVG pattern as existing icons (not MUI)
- **Avatar size**: 32px diameter (medium) for list items
- **Badge position**: Top-right corner overlay
- **Image fallback**: Letter circle on load failure
- **Letter source**: Resolved display name (consistent with text label)
- **Status logic**: Same for identities and contacts (query profile tables)

## Codebase Context

### Similar Patterns:
- **StatusDot component** (RelayTable.tsx): Shows colored status indicators
- **QR Icons** (qr-icons.tsx): Simple SVG icon components
- **Badge usage** (main.tsx:712-722): Unread count badges with colorPalette
- **Theme swatches** (ThemeSelector.tsx): 20px colored circles

### Architecture:
- **Chakra UI v3.30.0**: Primary component library
- **Electron + React**: Main process (Node.js) + Renderer process (React)
- **IPC Communication**: `window.nostling.*` APIs for backend queries
- **State Management**: Custom `useNostlingState()` hook

### Profile Backend:
- **Database**: SQLite with `nostr_profiles` table
- **Sources**: private_authored, private_received, public_discovered
- **Display Name Resolver**: `src/main/nostling/display-name-resolver.ts`
- **Profile Service**: `src/main/nostling/profile-service-integration.ts`

## Out of Scope

- **Profile editing UI**: Not part of this feature (backend already exists)
- **Public profile discovery UI**: Automatic background process, no UI needed
- **Profile caching/optimization**: Use existing backend queries as-is
- **Custom avatar upload**: Only use profile.content.picture URLs
- **Animated avatars**: Static images only
- **Avatar placeholders during load**: Simple immediate fallback to letter circle
- **Contact grouping by profile status**: Keep existing alphabetical sort

---

**Note**: This is a requirements specification, not an architecture design.
Edge cases, error handling details, and implementation approach will be
determined by the integration-architect during Phase 2.
