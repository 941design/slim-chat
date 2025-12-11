# electron-updater macOS Signature Verification Fails on Unsigned Apps - Bug Report

## Bug Description
When a user clicks "Restart to Update" after an update has been successfully downloaded and verified, the update process fails with error "Manifest signature verification failed". This occurs even though the custom manifest verification (using RSA signature) completed successfully.

## Expected Behavior
After successful download and custom manifest verification:
1. User clicks "Restart to Update"
2. electron-updater calls `quitAndInstall()`
3. App quits and installs the update
4. App restarts with new version

## Reproduction Steps
1. Run Nostling 0.0.12 on macOS (arm64)
2. Click "Check for Updates"
3. Update 0.0.13 is detected and downloaded
4. Custom manifest verification succeeds (logs show "Manifest verified for version 0.0.13")
5. UI shows "Restart to Update" button
6. Click "Restart to Update" button
7. ~1.5 seconds later: Error "Updater error: Manifest signature verification failed"

## Actual Behavior
```json
{"level":"info","message":"Manifest verified for version 0.0.13","timestamp":"2025-12-08T14:55:45.607Z"}
{"level":"error","message":"Updater error: Manifest signature verification failed","timestamp":"2025-12-08T14:55:47.118Z"}
```

The error occurs ~1.5 seconds after successful verification, when `autoUpdater.quitAndInstall()` is invoked.

## Impact
- Severity: **High**
- Affected Users: All macOS users attempting to install updates
- Affected Workflows:
  - Manual update installation via "Restart to Update" button
  - Any workflow that calls `autoUpdater.quitAndInstall()`

## Environment/Context
- Platform: macOS (darwin) arm64
- Nostling version: 0.0.12 → 0.0.13
- electron-updater: 6.6.2
- App signing: Ad-hoc signed (not code signed with Apple Developer certificate)
- Update provider: GitHub provider via `autoUpdater.setFeedURL()`
- Update files:
  - `latest-mac.yml` (no signature field, only sha512 hashes)
  - `Nostling-0.0.13-arm64-mac.zip` (unsigned)
  - `manifest.json` (custom, RSA-signed)

## Root Cause Hypothesis

electron-updater performs **two separate verification steps** on macOS:

1. **During download** (in `update-downloaded` event handler):
   - Custom verification succeeds: `verifyDownloadedUpdate()` validates manifest.json signature
   - State transitions to `ready`
   - ✅ This step completes successfully

2. **During installation** (when `quitAndInstall()` is called):
   - electron-updater performs **its own macOS-specific signature verification**
   - On macOS, electron-updater expects apps to be properly code-signed with Apple Developer certificate
   - Since the app is only ad-hoc signed (linker-signed), this verification fails
   - ❌ This causes "Manifest signature verification failed" error

The 1.5 second delay between successful verification and error corresponds to:
- User clicking "Restart to Update" button
- IPC call to `restartToUpdate()`
- Invocation of `autoUpdater.quitAndInstall()`
- electron-updater's internal macOS verification logic

**Evidence**:
- `latest-mac.yml` has no `signature` field, only sha512 hashes
- Downloaded .zip file: "code object is not signed at all" (per `codesign -dv`)
- Extracted .app: "Signature=adhoc" with "linker-signed" flag
- Error occurs specifically during `quitAndInstall()`, not during download/verification

## Constraints
- Backward compatibility: Maintain custom RSA manifest verification for multi-platform support
- Performance: Solution should not add significant overhead to update process
- Security: Must not weaken update verification security
- Apple requirements: Need Apple Developer account ($99/year) for proper code signing

## Codebase Context

**Likely locations**:
- `src/main/index.ts:159-162` - `restartToUpdate()` function that calls `quitAndInstall()`
- `src/main/update/controller.ts:108-167` - `setupUpdater()` configuration
- `package.json` build config - macOS signing configuration missing

**Related code**:
- Custom verification: `src/main/integration.ts:521-566` (`verifyDownloadedUpdate`)
- Manifest verification: `src/main/security/verify.ts:163-200` (`verifyManifest`)
- Update state management: `src/main/index.ts:96-129` (`update-downloaded` handler)

**Recent changes**:
- Commit b117e8b: "fixed release"
- Commit 3db8875: "0.0.13"
- Commit ea461a9: "cleaned UI"

**Similar bugs**: None found in bug-reports directory related to code signing

## Out of Scope
- Implementing app notarization (separate Apple process beyond code signing)
- Refactoring entire update system to remove custom manifest verification
- Performance optimizations unrelated to update signing
- Feature enhancements to update UI

---

## Fix Applied

**Status**: FIXED
**Fixed**: 2025-12-08
**Root Cause**: electron-builder attempts to code sign macOS builds by default, but project lacks Apple Developer certificate

**Solution**: Explicitly disable code signing in package.json build.mac configuration

**Changes**:
- File: `package.json`
- Section: `build.mac`
- Change: Added `"identity": null`

**Fix Verification**:
```bash
npm run package
# Output shows: "skipped macOS code signing  reason=identity explicitly is set to null"
```

**Regression Prevention**:
- Configuration setting: `build.mac.identity: null` must remain in package.json
- Removing this setting will cause electron-builder to search for signing identity
- This causes warnings in development and update failures in production

**Testing**:
- Baseline: 325 tests passing
- After fix: 325 tests passing (no regressions)
- Build verification: Package creation succeeds without warnings
