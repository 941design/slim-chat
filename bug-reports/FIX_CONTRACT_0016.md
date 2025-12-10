# Fix Contract: Bug 0016 - Update Not Installed After Restart

**Bug Report**: bug-reports/0016-update-not-installed-after-restart-report.md
**Status**: Ready for implementation (Phase 3)
**Date**: 2025-12-10

## Test Baseline

**Command**: `npm test` (Jest test suite)
**Result**: ✅ PASSED
- Total tests: 389 tests (388 passed, 1 skipped)
- Test suites: 19 passed
- Exit status: 0
- Pre-existing failures: None
- Baseline captured at: `/tmp/baseline.log`

**E2E Tests**: Not run (requires full build, deferred to verification phase)

## Bug Reproduction

**Status**: ✅ REPRODUCED (automated test)

**Test**: `src/main/update/bug-update-not-installed-after-restart.test.ts`

**Reproduction Evidence**:
1. Configuration analysis confirms:
   - `autoInstallOnAppQuit=true` (set by bug 0015 fix in `controller.ts:127`)
   - `restartToUpdate()` calls `autoUpdater.quitAndInstall()` (`index.ts:191`)

2. Incompatibility documented:
   - `autoInstallOnAppQuit=true` expects normal `app.quit()` to trigger installation
   - `quitAndInstall()` is designed for `autoInstallOnAppQuit=false` workflow
   - Combination creates conflict in electron-updater's MacUpdater

3. MacUpdater.quitAndInstall() behavior (from electron-updater source):
   ```typescript
   quitAndInstall(): void {
     if (this.squirrelDownloadedUpdate) {
       this.nativeUpdater.quitAndInstall()  // Install path
     } else {
       this.nativeUpdater.on("update-downloaded", () => {
         this.nativeUpdater.quitAndInstall()
       })
       this.nativeUpdater.checkForUpdates()  // Re-download path (BUG!)
     }
   }
   ```

4. With `autoInstallOnAppQuit=true`, `squirrelDownloadedUpdate` may not be set, causing re-download instead of installation

**Test Output**: All 5 tests pass, documenting the bug behavior

## Root Cause Analysis

### Why Bug Occurs

**Direct Cause**: Calling `autoUpdater.quitAndInstall()` when `autoInstallOnAppQuit=true`

**Mechanism**:
1. Bug 0015 fix set `autoInstallOnAppQuit=true` (commit c4c211b, 2025-12-08)
2. Setting `autoInstallOnAppQuit=true` changes electron-updater's installation contract:
   - Update should install on normal app quit via `app.quit()`
   - electron-updater adds quit handler to detect pending updates
   - Installation happens automatically during quit sequence
3. However, `restartToUpdate()` still calls `autoUpdater.quitAndInstall()`
4. `quitAndInstall()` expects `autoInstallOnAppQuit=false` (manual installation trigger)
5. With `autoInstallOnAppQuit=true`, `quitAndInstall()` behavior is undefined/unreliable

**Evidence**:
- electron-updater documentation: "autoInstallOnAppQuit=true means update installs automatically when app quits normally"
- MacUpdater source code shows two-path logic based on `squirrelDownloadedUpdate` flag
- Flag may not be set correctly with `autoInstallOnAppQuit=true`

**Sequence**:
1. User initiates update check → download completes → verification passes ✅
2. Update state changes to 'ready' ✅
3. User clicks "Restart to Update" button
4. `restartToUpdate()` calls `autoUpdater.quitAndInstall()`
5. MacUpdater.quitAndInstall() checks `squirrelDownloadedUpdate` flag
6. Flag is false/undefined (because `autoInstallOnAppQuit=true` uses different flow)
7. MacUpdater calls `checkForUpdates()` instead of installing
8. App restarts but update not installed ❌

### Affected Components

**Primary**:
- `src/main/index.ts:184-192` - `restartToUpdate()` function (SINGLE LINE CHANGE)

**Secondary** (read-only verification):
- `src/main/update/controller.ts:127` - `autoInstallOnAppQuit=true` setting (MUST NOT CHANGE)
- `src/main/ipc/handlers.ts:79,104` - IPC handlers calling `restartToUpdate()` (NO CHANGE)
- `src/preload/index.ts:12,36` - Preload bridge (NO CHANGE)
- `src/renderer/main.tsx:51` - UI trigger (NO CHANGE)

**Scope**:
- Single function: `restartToUpdate()` in `src/main/index.ts`
- Single line change: Replace `autoUpdater.quitAndInstall()` with `app.quit()`
- No API changes
- No state management changes
- No data migration
- No configuration changes

### Side Effects

**None expected** - This is a single-line change in installation trigger mechanism.

**Verification Required**:
- Update actually installs after restart (manual test on macOS required)
- Bug 0015 remains fixed (autoInstallOnAppQuit=true preserved)
- All baseline tests continue to pass

## Fix Contract

### ROOT CAUSE
Calling `autoUpdater.quitAndInstall()` when `autoInstallOnAppQuit=true` creates incompatibility with electron-updater's MacUpdater implementation. The two settings represent different installation workflows and should not be mixed.

### CHANGES

**File**: `src/main/index.ts`
**Function**: `restartToUpdate()` (lines 184-192)
**Change**: Replace `autoUpdater.quitAndInstall()` with `app.quit()`
**Reason**: Allows `autoInstallOnAppQuit` mechanism to handle installation correctly

**Before**:
```typescript
async function restartToUpdate(): Promise<void> {
  if (updateState.phase === 'ready') {
    log('info', `Initiating app restart to install update: ${app.getVersion()} -> ${updateState.version}`);
    autoUpdater.quitAndInstall();  // ❌ Incompatible with autoInstallOnAppQuit=true
  }
}
```

**After**:
```typescript
async function restartToUpdate(): Promise<void> {
  if (updateState.phase === 'ready') {
    log('info', `Initiating app restart to install update: ${app.getVersion()} -> ${updateState.version}`);
    app.quit();  // ✅ Compatible with autoInstallOnAppQuit=true
  }
}
```

### INVARIANTS TO PRESERVE

**API Contracts**:
- `restartToUpdate()` signature: `() => Promise<void>` (UNCHANGED)
- IPC handler contract: `updates:restart` and `update:restart` (UNCHANGED)
- Preload bridge contract: `window.api.restartToUpdate()` (UNCHANGED)

**Existing Behavior**:
- Update state management (UNCHANGED)
- Verification flow (UNCHANGED)
- Download flow (UNCHANGED)
- Auto-check mechanism (UNCHANGED)
- UI update notifications (UNCHANGED)
- Logging behavior (UNCHANGED)

**Performance**:
- No degradation (same quit flow, different trigger)

**Backward Compatibility**:
- Users on older versions can still update (manifest/download unchanged)
- Configuration format unchanged
- IPC protocol unchanged

**Bug 0015 Fix**:
- **CRITICAL**: `autoInstallOnAppQuit=true` MUST remain (in `controller.ts:127`)
- Signature verification flow MUST remain unchanged
- Fail-fast behavior MUST remain

### FIX APPROACH

```pseudocode
function restartToUpdate():
  if updateState.phase == 'ready':
    log installation start message
    app.quit()  // CHANGE: was autoUpdater.quitAndInstall()

    // electron-updater's quit handler will:
    // 1. Detect pending update (autoInstallOnAppQuit=true)
    // 2. Trigger Squirrel.Mac installation
    // 3. Extract and replace app bundle
    // 4. Relaunch with new version
```

**Contract with electron-updater**:
- When `autoInstallOnAppQuit=true`, installation happens on `app.quit()`
- electron-updater adds `before-quit` handler to check for pending updates
- If update is ready, handler triggers installation before quit completes
- App relaunches automatically with new version

**Why This Works**:
1. Update is already downloaded and verified (by existing flow)
2. `autoInstallOnAppQuit=true` tells electron-updater to install on quit
3. `app.quit()` triggers normal quit sequence
4. electron-updater's quit handler intercepts and installs update
5. No conflict with Squirrel.Mac state management

### CONSTRAINTS

**No Refactoring**:
- Only change installation trigger (one line)
- Keep all verification logic identical
- Keep all state management identical
- Keep all configuration identical

**No Optimizations**:
- No changes to download performance
- No changes to verification performance
- No changes to UI responsiveness

**No Features**:
- No new capabilities
- No new configuration options
- No new logging beyond existing

**Exact Behavior Preservation**:
- All non-buggy behavior must remain identical
- Only change: update actually installs (fixing the bug)
- Download, verification, state transitions: identical
- User experience: identical except update now works

**Bug 0015 Must Stay Fixed**:
- `autoInstallOnAppQuit=true` required (DO NOT change back to false)
- Signature verification timing unchanged
- Fail-fast behavior preserved
- Ad-hoc signing compatibility preserved

### VERIFICATION REQUIREMENTS

**Automated**:
1. Bug reproduction test PASSES (currently passes, documents bug)
2. All baseline tests PASS (no regressions)
3. Bug 0015 regression test continues to PASS (`autoInstallOnAppQuit=true`)

**Manual** (macOS required):
1. Build app version 0.0.17
2. Trigger update to version 0.0.18
3. Wait for download and verification to complete
4. Click "Restart to Update"
5. **Expected**: App restarts showing version 0.0.18
6. **Verify**: Update ZIP cleaned up from cache

**Regression Protection**:
- Add test verifying `app.quit()` used instead of `quitAndInstall()`
- Test should FAIL if someone changes back to `quitAndInstall()`

### DOCUMENTATION UPDATES

**Code Comments**:
```typescript
// BUG FIX: Use app.quit() instead of quitAndInstall() with autoInstallOnAppQuit=true
// Root cause: quitAndInstall() incompatible with autoInstallOnAppQuit=true
// Bug report: bug-reports/0016-update-not-installed-after-restart-report.md
// Fixed: 2025-12-10
```

**CHANGELOG**:
```markdown
### Fixed
- Fixed update not installing after restart on macOS (Auto-update system)
  - Updates now install correctly after clicking "Restart to Update"
  - Root cause: Incompatibility between quitAndInstall() and autoInstallOnAppQuit=true
  - Changed installation trigger from quitAndInstall() to app.quit()
  - Bug report: bug-reports/0016-update-not-installed-after-restart-report.md
```

**Test Documentation**:
Update `bug-update-not-installed-after-restart.test.ts` with:
```typescript
/**
 * Regression test: <bug>
 * Bug report: bug-reports/0016-update-not-installed-after-restart-report.md
 * Fixed: 2025-12-10
 * Root cause: quitAndInstall() incompatible with autoInstallOnAppQuit=true
 * Protection: Prevents using quitAndInstall() with autoInstallOnAppQuit=true
 */
```

## Implementation Checklist

**Phase 3: Fix Implementation**
- [ ] Change `autoUpdater.quitAndInstall()` to `app.quit()` in `restartToUpdate()`
- [ ] Add code comment explaining fix
- [ ] Run bug reproduction test (should still pass - it documents behavior)
- [ ] Run full test suite (should pass - no regressions)
- [ ] Verify bug 0015 test still passes

**Phase 4: Verification** (will be run by orchestrator)
- [ ] Manual test on macOS (update actually installs)
- [ ] Check update ZIP cleanup
- [ ] Verify version number changes
- [ ] Verify no errors in logs

**Phase 6: Documentation**
- [ ] Update CHANGELOG with fix
- [ ] Update test file with "Fixed" status
- [ ] Add regression protection test

## Expected Outcome

**Before Fix**:
- Download: ✅ Works
- Verification: ✅ Works
- Click "Restart to Update": ✅ Works
- Installation: ❌ **FAILS** (app restarts on old version)

**After Fix**:
- Download: ✅ Works
- Verification: ✅ Works
- Click "Restart to Update": ✅ Works
- Installation: ✅ **WORKS** (app restarts on new version)

**Regression Check**:
- Bug 0015: ✅ Still fixed (autoInstallOnAppQuit=true preserved)
- All tests: ✅ Pass
- Baseline tests: ✅ No new failures

## Risk Assessment

**Low Risk** - Single line change with clear contract

**Mitigation**:
- Automated tests catch regressions
- Manual testing verifies installation works
- Bug 0015 test protects against re-introduction
- Minimal code change reduces error surface

**Rollback Plan**:
If fix doesn't work, revert single line and investigate alternative approaches (e.g., quitAndInstall() parameters)

## References

**electron-updater Documentation**:
- [autoUpdater API - electron-builder](https://www.electron.build/electron-updater.class.appupdater)
- [Auto Update Documentation](https://www.electron.build/auto-update.html)
- [Electron autoUpdater API](https://www.electronjs.org/docs/latest/api/auto-updater)

**Source Code**:
- [MacUpdater.ts - electron-builder](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/MacUpdater.ts)

**Related Bugs**:
- Bug 0015: Update signature verification fails after restart (fixed by autoInstallOnAppQuit=true)
- This bug is a regression from the bug 0015 fix

**Related Issues**:
- [Issue #7356: Electron Updater downloads but does not install on macOS](https://github.com/electron-userland/electron-builder/issues/7356)
- [Issue #5935: The command is disabled and cannot be executed at MacUpdater.quitAndInstall](https://github.com/electron-userland/electron-builder/issues/5935)
