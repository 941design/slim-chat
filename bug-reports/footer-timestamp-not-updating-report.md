# Footer Timestamp Not Updating - Bug Report

## Bug Description
The "Last check" timestamp displayed in the footer (bottom right) does not update when checking for updates and no update is available. The timestamp remains as "Not yet checked" even after multiple update checks, in both manual and automatic check scenarios.

## Expected Behavior
When the user clicks "Check for updates" or when an automatic update check occurs:
1. The update check should complete (with or without finding an update)
2. The "Last check" timestamp in the footer should update immediately to show the current date/time
3. The timestamp should persist and be visible on subsequent app launches

## Reproduction Steps
1. Launch the application
2. Observe footer shows "Last check: Not yet checked"
3. Click "Check for updates" button
4. Wait for check to complete (no update available scenario)
5. Observe footer timestamp - it still shows "Not yet checked"
6. Refresh/reload the app
7. Observe footer timestamp - still shows "Not yet checked"

Alternative reproduction (automatic check):
1. Launch app and wait for automatic 5-minute interval check to trigger
2. Observe footer timestamp remains "Not yet checked"

## Actual Behavior
- The timestamp never updates from "Not yet checked"
- This occurs even after app refresh/reload
- The timestamp remains unset in both manual and automatic check scenarios when no update is available

## Impact
- **Severity**: Medium
- **Affected Users**: All users
- **Affected Workflows**: Update checking, user visibility into update system health
- Users cannot verify when the last update check occurred
- Users may repeatedly check for updates thinking the system isn't working
- Reduces trust in the update system's functionality

## Environment/Context
- Affects all platforms (darwin, linux, windows)
- Affects both development and production builds
- Occurs when `electron-updater` reports no update available

## Root Cause Hypothesis
Based on codebase analysis:

1. **Timestamp is set correctly in main process** (`src/main/index.ts:62`):
   - When `'checking-for-update'` event fires, `lastUpdateCheck` is set to ISO timestamp

2. **Timestamp is not propagated to renderer**:
   - The `broadcastUpdateState()` function (called after all update events) only sends the `updateState` object via IPC
   - It does **not** send the `lastUpdateCheck` timestamp
   - See `src/main/ipc/handlers.ts:133-142` - only sends `updateState`

3. **Renderer doesn't re-fetch status**:
   - The renderer receives `'update-state'` IPC messages but these don't include `lastUpdateCheck`
   - The renderer's `useStatus()` hook only calls `getStatus()` once on mount (`src/renderer/main.tsx:13-22`)
   - There's no automatic refresh of status after update state changes

4. **The gap**:
   - Main process: timestamp is set ✓
   - IPC broadcast: timestamp is NOT included ✗
   - Renderer: doesn't re-fetch status containing timestamp ✗

## Constraints
- **Backward compatibility**: Maintain existing IPC API contracts (`update-state` message structure)
- **Performance**: Avoid excessive IPC calls or status polling
- **Test coverage**: Must create failing Playwright test before implementing fix (as specified in bug report request)

## Codebase Context

### Likely locations for changes:

**Main Process** (`src/main/index.ts`):
- Lines 59-86: Event handlers for electron-updater
- Line 62: `lastUpdateCheck` timestamp is set
- Lines 42-46: `broadcastUpdateStateToMain()` function
- Lines 125-133: `getStatus()` function returns `lastUpdateCheck`

**IPC Layer** (`src/main/ipc/handlers.ts`):
- Lines 133-142: `broadcastUpdateState()` function - currently only sends `updateState`
- Potential solution: include `lastUpdateCheck` in broadcast OR trigger status refetch

**Renderer** (`src/renderer/main.tsx`):
- Lines 13-22: `useEffect` that loads initial status
- Lines 18-20: `onUpdateState` listener that updates `updateState` but not full status
- Potential solution: re-fetch full status when update state changes to 'idle' or 'failed'

**Footer Component** (`src/renderer/main.tsx`):
- Lines 66-74: Footer displays `lastUpdateCheck` from props
- Line 71: Formats timestamp for display

### Related code:
- Type definitions: `src/shared/types.ts:16-22` (`AppStatus` interface)
- Preload bridge: `src/preload/index.ts` (exposes `getStatus()` and `onUpdateState()`)

### Test files:
- Existing timestamp tests: `e2e/footer-timestamp.spec.ts`
- Update system tests: `e2e/updates.spec.ts`
- Test helpers: `e2e/helpers.ts`

## Out of Scope
- Refactoring unrelated update system code
- Performance optimizations beyond the bug fix
- Changes to update check frequency or scheduling
- UI/UX improvements to the footer beyond fixing the timestamp
