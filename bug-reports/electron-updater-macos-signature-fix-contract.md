# Fix Contract: electron-updater macOS Signature Verification

## ROOT CAUSE
electron-updater's MacUpdater class performs macOS-specific code signature verification during `quitAndInstall()`. This verification expects apps to be properly code-signed with an Apple Developer certificate. Nostling is currently ad-hoc signed (linker-signed only), causing this verification to fail.

## CHANGES

### File: package.json
**Section**: build.mac (lines 86-93)
**Change**: Add `identity: null` to disable code signing requirement
**Reason**: Instructs electron-builder to explicitly skip code signing, which makes electron-updater skip macOS signature verification during quitAndInstall()

```json
"mac": {
  "identity": null,  // ← ADD THIS
  "target": [
    "dmg",
    "zip"
  ],
  "category": "public.app-category.developer-tools",
  "minimumSystemVersion": "12.0.0"
}
```

## INVARIANTS TO PRESERVE

### API Contracts
- No changes to update API functions
- `autoUpdater.quitAndInstall()` signature unchanged
- IPC handlers (`restartToUpdate`) unchanged

### Existing Behavior
- Custom RSA manifest verification still active and required
- Update download flow unchanged
- Linux builds unaffected
- Update state management unchanged
- Backward compatibility with existing releases

### Security
- Custom RSA manifest verification provides cryptographic integrity
- SHA512 hash verification still performed by electron-updater
- No weakening of update security (custom verification is primary defense)

### Performance
- No degradation (configuration-only change)
- Update download speed unchanged
- Installation process timing unchanged

## FIX APPROACH

```pseudocode
Configuration Change (package.json):
  IF platform == macOS:
    SET identity = null
    REASON: Disable code signing requirement
    EFFECT: electron-updater skips signature verification in quitAndInstall()
  END IF

  Custom RSA verification continues independently:
    - During download phase (verifyDownloadedUpdate)
    - Before state transitions to 'ready'
    - Provides cryptographic security
```

## CONSTRAINTS
- ✅ No refactoring - pure configuration change
- ✅ No optimizations - minimal change only
- ✅ No features - fixes bug only
- ✅ Exact behavior preservation except signature check bypass

## VERIFICATION PLAN

### Manual Verification (Primary)
1. Apply fix to package.json (add `identity: null`)
2. Build Nostling 0.0.14 with fix
3. Test update from 0.0.13 → 0.0.14 on macOS
4. Verify:
   - Custom manifest verification succeeds
   - Click "Restart to Update"
   - App quits and installs (no error)
   - App restarts with new version

### Automated Verification (Limited)
- Unit test baseline: All existing tests MUST pass (no regressions)
- Configuration test: Verify `identity: null` present in package.json build.mac section
- Cannot fully automate (requires actual macOS build + install process)

### Regression Prevention
- Document signing configuration in README/docs
- Add comment in package.json explaining `identity: null`
- Bug report documents the issue for future reference
- No regression test possible (would require macOS CI with update simulation)

## ALTERNATIVE APPROACHES CONSIDERED

### Alternative 1: Get Apple Developer Certificate ($99/year)
- ❌ Rejected: Requires ongoing cost and certificate management
- ❌ Rejected: Not necessary given custom RSA verification
- ❌ Rejected: Doesn't align with bootstrap/minimal dependency philosophy

### Alternative 2: Disable autoInstallOnAppQuit
- ❌ Rejected: Doesn't fix the quitAndInstall() issue
- ❌ Rejected: Still fails when user clicks "Restart to Update"

### Alternative 3: Modify electron-updater source
- ❌ Rejected: Would require forking dependency
- ❌ Rejected: Maintenance burden
- ❌ Rejected: Configuration solution is simpler

## RISKS

### Low Risk
- Configuration change only
- Well-documented electron-builder option
- Custom RSA verification provides security
- Can revert by removing `identity: null`

### Mitigation
- Test on actual macOS hardware before release
- Verify custom RSA verification still active
- Check update logs confirm no errors

## SUCCESS CRITERIA
1. ✅ macOS update from 0.0.13 → 0.0.14 completes without error
2. ✅ Custom manifest verification still active and working
3. ✅ No regressions in existing tests
4. ✅ CHANGELOG updated with fix details
5. ✅ Code comment added to package.json explaining configuration

## REFERENCES
- Bug Report: bug-reports/electron-updater-macos-signature-verification-report.md
- electron-builder docs: https://www.electron.build/configuration/mac#identity
- electron-updater source: node_modules/electron-updater/out/MacUpdater.js
