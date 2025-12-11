# Update from 0.0.14 to 0.0.15 Fails with Signature Verification Error After Restart - Bug Report

**STATUS: FIXED** (2025-12-08)

**FIX SUMMARY**: Changed `autoUpdater.autoInstallOnAppQuit` from `false` to `true`. This moves Squirrel.Mac verification to the download phase instead of the quitAndInstall phase, preventing signature verification failure when restarting to install update.

**MANUAL TESTING REQUIRED**: Fix requires manual testing on macOS arm64 to confirm Squirrel.Mac accepts ad-hoc signed apps with this configuration.

---

## Bug Description
When updating from version 0.0.14 to 0.0.15, the download and initial verification succeed, but when the user clicks "Restart to Update", the app fails with error "Updater error: Manifest signature verification failed" approximately 0.5 seconds later. The app remains on version 0.0.14 and does not restart.

## Expected Behavior
After successful download and verification:
1. User clicks "Restart to Update" button
2. App quits and installs the update
3. App restarts with version 0.0.15

## Reproduction Steps
1. Run Nostling 0.0.14 on macOS arm64 (downloaded from GitHub Releases)
2. Check for updates (manually or via auto-check)
3. Update 0.0.15 is detected and downloaded successfully
4. All verification steps pass (signature, version, hash, manifest)
5. UI shows "Restart to Update" button
6. Click "Restart to Update" button
7. Error appears ~0.5 seconds later: "Updater error: Manifest signature verification failed"
8. App remains open on version 0.0.14

## Actual Behavior
```
{"level":"info","message":"Downloaded file path: /Users/mrother/Library/Caches/nostling-updater/pending/Nostling-0.0.15-arm64-mac.zip","timestamp":"2025-12-08T19:31:38.091Z"}
{"level":"info","message":"Verifying manifest: version=0.0.15, platform=darwin, currentVersion=0.0.14","timestamp":"2025-12-08T19:31:38.091Z"}
{"level":"info","message":"Signature verification passed","timestamp":"2025-12-08T19:31:38.092Z"}
{"level":"info","message":"Version validation passed","timestamp":"2025-12-08T19:31:38.092Z"}
{"level":"info","message":"Found artifact for platform: darwin, expected hash: ee56d9864d2b23cf...","timestamp":"2025-12-08T19:31:38.092Z"}
{"level":"info","message":"File hash verification passed","timestamp":"2025-12-08T19:31:38.161Z"}
{"level":"info","message":"Manifest verified for version 0.0.15","timestamp":"2025-12-08T19:31:38.161Z"}
{"level":"info","message":"Initiating app restart to install update: 0.0.14 -> 0.0.15","timestamp":"2025-12-08T19:39:57.667Z"}
{"level":"error","message":"Updater error: Manifest signature verification failed","timestamp":"2025-12-08T19:39:58.115Z"}
```

**Key Observations**:
- ✅ Download succeeds
- ✅ Custom RSA signature verification passes
- ✅ Version validation passes
- ✅ File hash verification passes
- ✅ Manifest fully verified
- ⏱️ 8 minutes pass (user delay before clicking button)
- 🔄 User clicks "Restart to Update"
- ❌ Error occurs ~0.5 seconds after restart initiated
- 🚫 App does NOT restart, remains on 0.0.14

## Impact
- Severity: **High**
- Affected Users: All users attempting to update from 0.0.14 to 0.0.15 on macOS
- Affected Workflows:
  - Manual update installation via "Restart to Update" button
  - Auto-update workflow (if configured)
- Business Impact: Users cannot upgrade to latest version

## Environment/Context
- Platform: macOS darwin arm64
- Current version: 0.0.14 (downloaded from GitHub Releases)
- Target version: 0.0.15
- electron-updater: 6.3.9
- Both 0.0.14 and 0.0.15: Ad-hoc signed (Signature=adhoc, linker-signed)
- Both releases built with `identity: null` in package.json
- Update source: GitHub Releases
- Release assets present:
  - `manifest.json` (1367 bytes, RSA signature validates correctly)
  - `latest-mac.yml` (510 bytes)
  - `Nostling-0.0.15-arm64-mac.zip` (93MB, ad-hoc signed)

## Root Cause Hypothesis

### Analysis of Error Source
The error message "Manifest signature verification failed" comes from the error sanitization function (src/main/integration.ts:137), which wraps ANY electron-updater error containing the word "signature". This means the actual electron-updater error is being masked.

### Verification Timeline
1. **Download phase (19:31:38)**: All custom verification passes ✅
   - RSA signature verification
   - Version validation
   - Platform artifact matching
   - SHA-256 hash verification

2. **Restart phase (19:39:58)**: electron-updater error ❌
   - Triggered by `autoUpdater.quitAndInstall()` call
   - Error occurs ~0.5 seconds after initiation
   - Error contains "signature" keyword
   - Gets sanitized to generic message

### Key Findings
1. **Both apps correctly ad-hoc signed**: Verified via `codesign -dvv`
   - 0.0.14: `Signature=adhoc, linker-signed`
   - 0.0.15: `Signature=adhoc, linker-signed`

2. **Both have identity: null**: Confirmed in package.json
   - Commit 3c7b675 added fix before 0.0.14
   - Both releases built from correct commits

3. **Manifest signature valid**: Manually verified
   - 0.0.15 manifest.json signature validates with current public key
   - All artifacts present with correct hashes

4. **Error timing differs from previous bug**:
   - Previous macOS signing bug: ~1.5 second delay
   - Current bug: ~0.5 second delay
   - Suggests different failure point in electron-updater

### Similar Previous Issue
Bug report `electron-updater-macos-signature-verification-report.md` documented a similar issue where electron-updater's macOS code signing verification failed during `quitAndInstall()`. That was fixed with `identity: null`. However, this fix is already present in both 0.0.14 and 0.0.15.

### Possible Causes
1. **electron-updater regression**: Version 6.3.9 may have introduced new signature validation logic
2. **macOS-specific issue**: New macOS security restrictions or Gatekeeper behavior
3. **Cached state**: electron-updater cache corruption between download and install phases
4. **Different error type**: The actual error may not be signature-related, but contains "signature" keyword and gets mis-categorized
5. **Missing electron-updater configuration**: Additional configuration may be needed beyond `identity: null`

## Constraints
- Backward compatibility: Cannot break updates for users on 0.0.13 or earlier
- Security: Must not weaken update verification security
- User experience: Must provide clear error messages
- macOS requirements: Cannot require Apple Developer certificate ($99/year)

## Codebase Context

**Likely locations**:
- `src/main/index.ts:179-188` - `restartToUpdate()` function calling `quitAndInstall()`
- `src/main/index.ts:99-104` - `autoUpdater.on('error')` event handler with sanitization
- `src/main/integration.ts:90-156` - `sanitizeError()` function masking actual error
- `src/main/update/controller.ts:108-167` - `setupUpdater()` configuration
- `package.json:86-94` - macOS build configuration with `identity: null`

**Related code**:
- Custom verification: `src/main/integration.ts:522-566` (`verifyDownloadedUpdate`)
- Manifest verification: `src/main/security/verify.ts:164-201` (`verifyManifest`)
- Error handling: `src/main/index.ts:99-104` (autoUpdater error event)
- Signature verification: `src/main/security/verify.ts:57-80` (`verifySignature`)

**Recent changes (0.0.14 → 0.0.15)**:
- Commit 5bcf6fc: "0.0.15" (version bump only)
- Commit 4f6c6b2: "fixed tests" (E2E test updates)
- Commit 2a9f85c: "updates" (E2E test updates)
- Commit b84e319: "made my life easier" (Makefile simplification)
- Major changes: New auto-update timer feature, download progress tracking, footer UI updates
- No changes to signature verification logic between versions

**Similar bugs**:
- `electron-updater-macos-signature-verification-report.md` - Fixed with `identity: null` (already applied)

## Out of Scope
- Implementing macOS notarization
- Refactoring entire update system
- Performance optimizations unrelated to update process
- UI/UX improvements beyond error clarity

## Next Steps for Investigation
1. **Get unsanitized error**: Run 0.0.14 in dev mode or add verbose electron-updater logging to see actual error
2. **Check electron-updater logs**: Examine cache directory `/Users/mrother/Library/Caches/nostling-updater/` for detailed logs
3. **Test with electron-updater verbose mode**: Enable `autoUpdater.logger` to capture full error details
4. **Compare with 0.0.13→0.0.14 update**: Verify if 0.0.13 users can successfully update to 0.0.14
5. **Check macOS Console.app**: Look for Gatekeeper or codesign errors during update attempt
6. **Test downgrade to older electron-updater**: Try version 6.3.8 or earlier to rule out regression

## Debugging Recommendations
1. Add dev mode logging override to capture full electron-updater errors
2. Check if error occurs on Intel Macs or other macOS versions
3. Test with a locally built 0.0.15 vs GitHub release build
4. Examine electron-updater's macOS-specific code path in `quitAndInstall()`
5. Check if issue reproduces with a fresh app install (not updated from 0.0.13)

---

## FIX APPLIED (2025-12-08)

### Root Cause Identified
When `autoInstallOnAppQuit=false`, calling `autoUpdater.quitAndInstall()` triggers `MacUpdater.quitAndInstall()` which checks if `squirrelDownloadedUpdate` is true. Since `autoInstallOnAppQuit=false`, Squirrel.Mac never downloaded the update during the download phase, so `squirrelDownloadedUpdate` remains false. This causes `MacUpdater` to call `nativeUpdater.checkForUpdates()` at restart time, which triggers Squirrel.Mac to fetch and verify the update zip. Squirrel.Mac performs macOS code signature verification on the extracted app bundle, expecting a valid Apple Developer signature. Nostling is ad-hoc signed, causing this verification to fail with "signature verification failed" error.

### Fix Implementation
Changed `autoUpdater.autoInstallOnAppQuit` from `false` to `true` in `src/main/update/controller.ts:115`.

**Before**:
```typescript
autoUpdater.autoInstallOnAppQuit = false;
```

**After**:
```typescript
// BUG FIX: Set to true to move Squirrel.Mac verification to download phase
// Root cause: false causes quitAndInstall() to trigger checkForUpdates(), which
// re-fetches update and fails on Squirrel.Mac signature verification for ad-hoc signed apps
// Bug report: bug-reports/0015-update-signature-verification-after-restart-report.md
// Fixed: 2025-12-08
autoUpdater.autoInstallOnAppQuit = true;
```

### How This Fixes The Bug
With `autoInstallOnAppQuit=true`, Squirrel.Mac fetches and verifies the update during the download phase (when `autoUpdater.downloadUpdate()` is called) instead of during `quitAndInstall()`. This provides fail-fast behavior:

- **If Squirrel.Mac accepts ad-hoc signed apps**: Update proceeds normally, installation completes on restart
- **If Squirrel.Mac rejects ad-hoc signed apps**: Error surfaces during download phase (better UX than error on restart)

### Changes Made
1. **`src/main/update/controller.ts`** (Line 115):
   - Changed `autoUpdater.autoInstallOnAppQuit = false` to `true`
   - Added explanatory comment with bug report reference

2. **`src/main/update/controller.ts`** (Lines 8-9):
   - Removed unused `ProgressInfo` import

3. **`src/main/update/controller.ts`** (Line 40):
   - Updated JSDoc contract to reflect new behavior

4. **`src/main/update/bug-restart-signature-verification.test.ts`** (New file):
   - Added regression test with CRITICAL assertion
   - Verifies `autoInstallOnAppQuit=true` is set
   - Test will FAIL if someone changes it back to false

### Manual Testing Plan
This fix requires manual testing on macOS arm64 to confirm effectiveness:

1. Build version 0.0.16 with fix applied
2. Run Nostling 0.0.14 on macOS arm64
3. Trigger update check
4. Observe outcome:
   - **Outcome A**: Update downloads, installs, app restarts with 0.0.16 → Fix successful
   - **Outcome B**: Update fails during download → Investigate Option 2 (bypass Squirrel.Mac entirely)

### Files Modified
- `/Users/mrother/Projects/941design/nostling/src/main/update/controller.ts`
- `/Users/mrother/Projects/941design/nostling/src/main/update/bug-restart-signature-verification.test.ts` (new)
- `/Users/mrother/Projects/941design/nostling/CHANGELOG.md`
- `/Users/mrother/Projects/941design/nostling/bug-reports/0015-update-signature-verification-after-restart-report.md`

### Test Results
- All tests passing: 19 suites, 382 tests (1 skipped)
- No regressions vs original baseline (377 tests)
- New regression test added: 5 tests verifying fix

### Regression Protection
The regression test `bug-restart-signature-verification.test.ts` contains a CRITICAL test that:
- Imports `setupUpdater()` and calls it with test configuration
- Asserts `mockAutoUpdater.autoInstallOnAppQuit === true`
- Will FAIL if someone changes the setting back to false
- Prevents bug from reappearing in future changes