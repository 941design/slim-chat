# Auto-Update Footer Integration - Requirements Specification

## Problem Statement

Currently, update controls are located in the sidebar, requiring manual user interaction for every update check. Users must remember to check for updates periodically, and the update status is not prominently visible. This creates friction in the update process and reduces the likelihood that users will keep their application up to date.

This feature aims to streamline the update experience by:
1. Moving all update controls to the footer for better visibility
2. Implementing automatic update checks (startup + periodic)
3. Providing clear, immediate feedback on update status
4. Making the update process more discoverable and user-friendly

## Core Functionality

The application footer will become the central hub for all update-related information and controls. It will:
- Display current version and update status
- Automatically check for updates on startup and periodically
- Provide a manual refresh control (circular arrows icon)
- Show download progress with detailed metrics
- Display action buttons when updates are available
- Present error information when checks fail

## Functional Requirements

### FR1: Footer Layout and Status Display
The footer shall display update status information using the following format:
- **When up-to-date**: `v{version} • Up to date`
- **When checking**: `v{version} • Checking for updates...`
- **When update available**: `v{version} • Update available: v{new-version}`
- **When downloading**: `v{version} • Downloading update: {percent}% ({transferred} / {total}) @ {speed}`
- **When verifying**: `v{version} • Verifying update...`
- **When ready**: `v{version} • Update ready: v{new-version}`
- **When failed**: `v{version} • Update failed: {error-message}`

**Acceptance Criteria**:
- Version and status are displayed as a single combined text element
- Status text updates in real-time as update phase changes
- Download progress includes percentage, transferred/total size, and speed
- Error messages are user-friendly and actionable

### FR2: Automatic Update Checks
The application shall automatically check for updates:
- On application startup (once window is ready)
- At configurable intervals (default: hourly)

**Acceptance Criteria**:
- First check happens within 5 seconds of app startup
- Subsequent checks occur at the configured interval
- Timer resets after manual refresh (prevent double-checking)
- Automatic checks show same UI feedback as manual checks
- Checks only occur when `autoUpdate` config is enabled

### FR3: Manual Refresh Control
The footer shall display a refresh icon (circular arrows) that:
- Is always visible in the footer
- Triggers an immediate update check when clicked
- Is disabled (greyed out) during: checking, downloading, verifying phases
- Is enabled during: idle, available, ready, failed phases

**Acceptance Criteria**:
- Icon is clearly recognizable as a refresh/reload action
- Disabled state is visually distinct (reduced opacity, no hover effect)
- Clicking while disabled has no effect
- Manual refresh resets the automatic check timer

### FR4: Download Control
When an update is available (phase: 'available'), the footer shall display:
- A "Download Update" button or similar call-to-action
- The version number of the available update

**Acceptance Criteria**:
- Button is prominently displayed and clearly actionable
- Clicking initiates the download via existing `downloadUpdate()` IPC
- Button disappears/changes once download starts
- Download is never automatic (maintains GAP-005 behavior)

### FR5: Download Progress Display
During download (phase: 'downloading'), the footer shall display:
- Download percentage (e.g., "45%")
- Transferred and total size (e.g., "25 MB / 50 MB")
- Download speed (e.g., "5.2 MB/s")

**Acceptance Criteria**:
- Progress updates smoothly as download progresses
- Size values are formatted with appropriate units (KB, MB, GB)
- Speed is calculated and displayed accurately
- UI does not flicker or jump during updates

### FR6: Install/Restart Control
When an update is ready (phase: 'ready'), the footer shall display:
- A "Restart to Update" button or similar call-to-action
- The version number of the downloaded update

**Acceptance Criteria**:
- Button is prominently displayed
- Clicking triggers restart via existing `restartToUpdate()` IPC
- User can continue working without restarting (no forced restart)

### FR7: Configurable Check Interval
The application shall provide user configuration for automatic check interval:
- Options: 1 hour, 2 hours, 4 hours, 12 hours, daily, never
- Default: 1 hour
- Stored in AppConfig

**Acceptance Criteria**:
- Configuration is persisted across app restarts
- Changing interval takes effect immediately (restarts timer)
- "Never" option disables automatic checks but allows manual refresh
- Configuration UI is accessible (exact location TBD by architect)

### FR8: Error Handling
When an update operation fails (phase: 'failed'), the footer shall:
- Display the error message in the status text
- Show the refresh icon as enabled (user can retry)
- Log the full error details for debugging

**Acceptance Criteria**:
- Error messages are user-friendly (existing `sanitizeError` logic)
- Error state is clearable by clicking refresh
- Errors don't prevent future update checks

### FR9: Sidebar Modification
The sidebar shall be modified to:
- Remove all update-related controls and status display
- Keep the sidebar structure intact for future features
- Maintain existing styling and layout

**Acceptance Criteria**:
- Sidebar remains visible with same dimensions
- Update-related UI elements are completely removed
- No broken layout or styling issues
- Sidebar is ready for future content

## Critical Constraints

### C1: Preserve Existing Update State Machine
The current 8-phase update state machine must remain unchanged:
- idle → checking → available → downloading → downloaded → verifying → ready → failed
- All existing state transitions and business logic preserved
- No changes to `UpdateState`, `UpdatePhase` types

**Why it matters**: The state machine is battle-tested and includes important phases like verification. Changing it would require re-testing all edge cases and security validations.

### C2: Maintain Manual Download Control (GAP-005)
Downloads must always require explicit user action:
- `autoUpdater.autoDownload` remains `false` (unless user sets auto-download config)
- Download button must be clicked to initiate download
- No silent or automatic downloads

**Why it matters**: Privacy and user control are core principles. Users must consent to bandwidth usage.

### C3: Preserve IPC Architecture
The existing IPC structure must be maintained:
- Modern nested API: `window.api.updates.*`, `window.api.config.*`
- Legacy flat API preserved for backward compatibility
- No breaking changes to type definitions

**Why it matters**: Any IPC changes could break E2E tests and future integrations.

### C4: Footer Must Handle State Transitions Gracefully
The footer must handle rapid state transitions without flickering:
- State updates should be debounced or smoothed where appropriate
- UI should not "flash" between states
- Progress updates should be smooth (not jarring)

**Why it matters**: Poor UI feedback creates perception of bugs even when system works correctly.

### C5: Concurrent Operation Prevention
The system must prevent concurrent update operations:
- Only one update check at a time (existing concurrency guard)
- Only one download at a time (existing concurrency guard)
- Manual refresh disabled during active operations

**Why it matters**: Race conditions can corrupt update state and lead to unpredictable behavior.

## Integration Points

### IP1: Main Process - Auto-Updater Integration
**Location**: `src/main/index.ts`
- Hook into existing `autoUpdater` event handlers
- Add timer for periodic checks
- Modify `checkForUpdates()` to reset timer on manual trigger

### IP2: Renderer - Footer Component
**Location**: `src/renderer/main.tsx`
- Modify existing `Footer` component
- Add refresh icon button
- Add download/restart buttons (conditionally rendered)
- Display progress information from `updateState.progress`

### IP3: IPC - Update State Broadcasting
**Location**: `src/main/ipc/handlers.ts`, `src/preload/index.ts`
- Use existing `broadcastUpdateState()` mechanism
- Ensure `progress` field is populated during downloads
- No new IPC channels required (use existing ones)

### IP4: Configuration Management
**Location**: `src/main/config.ts`, `src/shared/types.ts`
- Add `autoCheckInterval` field to `AppConfig` type
- Options: `1h`, `2h`, `4h`, `12h`, `24h`, `never`
- Default: `1h`

### IP5: Styling Integration
**Location**: `src/renderer/styles.css`
- Add styles for refresh icon (circular arrows)
- Add styles for footer buttons (download, restart)
- Add styles for progress display
- Add styles for disabled states

## User Preferences

### Layout Philosophy
- Footer should be information-dense but not cluttered
- Primary action (download/restart) should be obvious
- Status text is the primary information source
- Buttons are secondary (only shown when action needed)

### Progressive Disclosure
- Minimal UI when idle ("v1.0.0 • Up to date")
- Progressively show more detail as update progresses
- Buttons only appear when actionable
- Refresh icon is subtle but always accessible

### Visual Polish
- Smooth transitions between states
- Progress indicators feel responsive
- Disabled states are clear but not jarring
- Consistent with existing dark theme

## Codebase Context

### Similar Features
- **Current sidebar update controls**: Pattern for state-based button labels and disabled states
- **Footer with version/timestamp**: Existing footer structure to build upon
- **useStatus() hook**: Pattern for subscribing to update state changes

### Existing Patterns
- **Phase-based UI rendering**: Use `useMemo` for computed button labels/visibility
- **IPC error handling**: Wrap IPC calls in try-catch with console.error
- **State broadcasting**: Main process broadcasts to renderer via `update-state` channel
- **Concurrency guards**: Module-level flags prevent concurrent operations

### Technical Considerations
- React 18 with hooks (useState, useEffect, useMemo)
- TypeScript with strict mode
- CSS custom properties for theming
- IPC via contextBridge (security first)

## Out of Scope

This feature explicitly does NOT include:
- Changes to the manifest verification process
- Modifications to the download mechanism
- Changes to the auto-updater configuration
- UI for managing configuration (interval selection, etc.) - location TBD
- Changes to the main content area or header
- Removal of the sidebar component itself
- Changes to the update state machine phases or transitions
- Modifications to error sanitization logic
- Changes to logging or diagnostics

---

**Note**: This is a requirements specification focusing on WHAT to build and WHY. The integration-architect will determine HOW to implement these requirements, including:
- Exact footer layout and positioning
- Timer implementation strategy
- State management approach
- Component decomposition
- Edge case handling
- Testing strategy
