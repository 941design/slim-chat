# Auto-Update 404 Error - Bug Report

## Bug Description
When checking for updates manually in the installed SlimChat app (version 0.0.0), electron-updater fails with a 404 error trying to fetch `latest-mac.yml` from GitHub releases, even though the release exists with proper artifacts (manifest.json, .dmg, .AppImage).

## Expected Behavior
When the user checks for updates:
1. The app should fetch the custom `manifest.json` from the GitHub release
2. It should verify the signature and version
3. It should show "No updates available" if the current version (0.0.0) matches the latest release (0.0.0)
4. It should NOT attempt to fetch electron-updater's default `latest-mac.yml` file

## Reproduction Steps
1. Install SlimChat app (version 0.0.0) on macOS
2. Click "Check for Updates" menu item or trigger manual update check
3. Observe error in logs/UI

## Actual Behavior
Error message:
```
Error: Cannot find latest-mac.yml in the latest release artifacts (https://github.com/941design/slim-chat/releases/download/0.0.0/latest-mac.yml): HttpError: 404
```

The app tries to fetch `latest-mac.yml` (electron-updater's default GitHub provider format) instead of the custom `manifest.json` that's actually present in the release.

## Impact
- Severity: **High**
- Affected Users: All users with installed versions attempting to check for updates
- Affected Workflows: Manual and automatic update checks both fail

## Environment/Context
- Platform: macOS (error shows latest-mac.yml which is macOS-specific)
- Version: 0.0.0
- GitHub Release: 0.0.0 exists with artifacts:
  - manifest.json ✅
  - SlimChat-0.0.0.dmg ✅
  - SlimChat-0.0.0-x86_64.AppImage ✅
- Trigger: Manual update check via UI

## Root Cause Hypothesis

**The app has TWO update systems that are not properly integrated:**

1. **electron-updater (active but misconfigured):**
   - Location: `src/main/index.ts:48-110`
   - Currently uses default GitHub provider
   - Expects `latest-mac.yml`, `latest-linux.yml` files in releases
   - Called via `autoUpdater.checkForUpdates()` (line 116)

2. **Custom manifest.json system (implemented but not wired up):**
   - Manifest generation: `scripts/generate-manifest.ts`
   - Verification: `src/main/integration.ts:verifyDownloadedUpdate()`
   - RSA signature verification: `src/main/security/verify.ts`
   - Version validation: `src/main/security/version.ts`

**The problem:** `autoUpdater.checkForUpdates()` is called without configuring electron-updater to use a custom provider or feed URL pointing to `manifest.json`. Instead, it uses the default GitHub provider which expects electron-builder's standard release format.

**Key missing configuration:**
- `autoUpdater.setFeedURL()` is never called to point to the custom manifest.json
- electron-updater's `provider` option is not set to 'generic' or custom
- The custom verification workflow in `verifyDownloadedUpdate()` is only called AFTER electron-updater downloads an update, but electron-updater can't even find updates to download

## Constraints
- **Backward compatibility:** Must maintain existing custom manifest.json format and RSA signature verification
- **Security:** Cannot weaken security by disabling signature verification
- **API contracts:** The custom manifest format is used by the release pipeline and must be preserved
- **Version 0.0.0:** The fix must work with version 0.0.0 and gracefully handle "no updates available" scenario

## Codebase Context

**Likely location of fix:**
- `src/main/index.ts:48-110` - `setupAutoUpdater()` function needs to configure feed URL
- `src/main/integration.ts:50-69` - `constructManifestUrl()` already builds the correct URL
- `src/main/update/controller.ts:127-131` - `setupUpdater()` may need to set feed URL

**Related code:**
- `src/main/integration.ts:230-308` - Custom verification workflow (already implemented)
- `scripts/generate-manifest.ts:81-164` - Manifest generation (working correctly)
- `.github/workflows/release.yml` - Release pipeline (working correctly, publishes manifest.json)

**Electron-updater configuration options:**
- `autoUpdater.setFeedURL({ provider: 'generic', url: 'https://...' })` - points to custom update server
- Generic provider expects `{url}/manifest.json` format or can use custom channel files
- Custom providers can handle non-standard formats

## Out of Scope
- Refactoring the entire update system to use only electron-updater's built-in formats
- Removing the custom manifest.json system (it's already implemented and working in CI/CD)
- Performance optimizations beyond the fix
- Supporting Windows updates (not currently in build config)
- Changing the RSA signature verification approach
