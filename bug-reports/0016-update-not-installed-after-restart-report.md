# Update Not Installed After Restart - Bug Report

## Bug Description

After downloading and validating an update successfully, clicking "Restart to Update" restarts the application but the new version is not installed. The app continues running on the old version (0.0.17) instead of updating to the new version (0.0.18).

## Expected Behavior

When the user clicks "Restart to Update":
1. App should quit
2. Squirrel.Mac should extract the update ZIP and replace the app bundle
3. App should restart with the new version (0.0.18)
4. User should see the new version number in the UI

## Reproduction Steps

1. Run SlimChat version 0.0.17
2. Trigger update check (manual or automatic)
3. Wait for download to complete (SlimChat-0.0.18-arm64-mac.zip)
4. Observe logs show:
   - "Downloaded file path: /Users/.../SlimChat-0.0.18-arm64-mac.zip"
   - "Signature verification passed"
   - "Version validation passed"
5. Click "Restart to Update" button in UI
6. Observe app restarts
7. Check version number after restart

## Actual Behavior

- Download completes successfully
- Manifest verification passes
- RSA signature verification passes
- Version validation passes
- Update state changes to 'ready'
- "Restart to Update" button appears
- Clicking button triggers restart (log: "Initiating app restart to install update: 0.0.17 -> 0.0.18")
- **App restarts but remains on version 0.0.17**
- No error messages logged
- Update ZIP file may or may not remain in cache

## Impact

- **Severity**: Critical
- **Affected Users**: All macOS users attempting to update
- **Affected Workflows**: Auto-update system completely broken - users cannot update to new versions

## Environment/Context

- Platform: macOS (darwin)
- Architecture: arm64
- Current Version: 0.0.17
- Target Version: 0.0.18
- Code Signing: Ad-hoc (identity=null)
- Updater Library: electron-updater with Squirrel.Mac framework
- Update Mechanism: Generic provider with custom manifest

## Root Cause Hypothesis

The issue is likely in the `autoUpdater.quitAndInstall()` call behavior with `autoInstallOnAppQuit=true` configuration:

**Primary Hypothesis**: The combination of `autoInstallOnAppQuit=true` and calling `quitAndInstall()` may create a conflict in electron-updater's internal state machine. When `autoInstallOnAppQuit=true`, electron-updater expects the installation to happen automatically when the app quits normally, not via explicit `quitAndInstall()` call.

**Supporting Evidence**:
1. Setting `autoInstallOnAppQuit=true` was done to fix bug 0015 (signature verification after restart)
2. The fix moved Squirrel.Mac verification from restart-time to download-time
3. However, the installation trigger mechanism may not have been updated accordingly
4. `quitAndInstall()` is designed for `autoInstallOnAppQuit=false` workflow
5. With `autoInstallOnAppQuit=true`, the update should install on normal app quit, not via `quitAndInstall()`

**Relevant Code Locations**:
- Installation trigger: `src/main/index.ts:184-192` (`restartToUpdate()` function)
- Configuration: `src/main/update/controller.ts:127` (`autoInstallOnAppQuit = true`)
- Previous bug fix: `bug-reports/0015-update-signature-verification-after-restart-report.md`

**Alternative Hypotheses**:
1. Squirrel.Mac rejecting ad-hoc signed apps during extraction (despite passing verification)
2. Missing `isSilent` or `isForceRunAfter` parameters to `quitAndInstall()`
3. File permissions preventing Squirrel.Mac from replacing app bundle
4. Gatekeeper blocking unsigned app replacement

## Constraints

- **Backward compatibility**: Must not break existing update workflow for users already on older versions
- **Security**: Must maintain RSA signature verification and manifest validation
- **Code signing**: Must continue to work with ad-hoc signing (identity=null)
- **macOS compatibility**: Must work with macOS Gatekeeper restrictions
- **User experience**: Update must complete without requiring manual file operations

## Codebase Context

### Likely Location
- **Primary**: `src/main/index.ts:184-192` - `restartToUpdate()` function that calls `quitAndInstall()`
- **Secondary**: `src/main/update/controller.ts:109-184` - `setupUpdater()` configuration

### Related Code
- `autoUpdater.quitAndInstall()` parameters: may need `isSilent`, `isForceRunAfter` flags
- Normal app quit handlers: may need to trigger installation instead of explicit restart
- Update state management: `updateState.phase = 'ready'` transition

### Recent Changes
- Commit `c4c211b` (2025-12-08): Changed `autoInstallOnAppQuit` from `false` to `true`
- Bug 0015 fix: Moved Squirrel.Mac verification to download phase
- This bug is a regression introduced by the bug 0015 fix

### Similar Bugs
- Bug 0015: Update signature verification failure after restart (fixed by `autoInstallOnAppQuit=true`)
- The current bug is the opposite side of the same coin

## Out of Scope

- Changing code signing approach (must remain ad-hoc signed)
- Implementing alternative update mechanisms (must use electron-updater)
- Adding manual installation fallback
- Refactoring entire update system
- Performance optimizations
- UI/UX improvements beyond fixing the core installation issue

## Investigation Required

1. **Check electron-updater documentation**: Clarify the contract between `autoInstallOnAppQuit=true` and `quitAndInstall()`
2. **Test `quitAndInstall()` parameters**: Try passing `isSilent=false, isForceRunAfter=true`
3. **Alternative quit flow**: Test if normal `app.quit()` works better than `quitAndInstall()`
4. **Squirrel.Mac logs**: Check for Squirrel.Mac specific logs that might reveal installation failures
5. **File system inspection**: Verify if update ZIP is being extracted but not swapped in
6. **macOS Console.app**: Check system logs for Gatekeeper or code signing errors

## Acceptance Criteria

Fix is successful when:
1. Download and validation continue to work (no regression)
2. Clicking "Restart to Update" actually installs the update
3. App restarts showing new version number
4. Update ZIP is cleaned up from cache after successful installation
5. No error messages during installation
6. Fix works with ad-hoc signing (identity=null)
7. Regression test added to prevent future breakage
8. Bug 0015 remains fixed (no re-introduction of signature verification after restart issue)
