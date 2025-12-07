# macOS Download Fails - ZIP File Missing from Release

## Bug Description
When clicking "Download" for an available update on macOS, the download fails with error "Failed to fetch manifest from server". The root cause is that `latest-mac.yml` references a `.zip` file as the primary download artifact, but the release workflow only uploads `.dmg` files.

## Expected Behavior
The update download should:
1. Read `latest-mac.yml` from GitHub releases
2. Download the artifact referenced in `path` field
3. Complete the download successfully

## Reproduction Steps
1. Run SlimChat version 0.0.8 on macOS
2. Check for updates (shows 0.0.9 available)
3. Click "Download"
4. Observe error: "Failed to fetch manifest from server"

## Actual Behavior
Error logs show:
```json
{"level":"error","message":"Updater error: Failed to fetch manifest from server","timestamp":"2025-12-07T21:07:34.954Z"}
```

### Investigation Findings

**latest-mac.yml content (0.0.9):**
```yaml
version: 0.0.9
files:
  - url: SlimChat-0.0.9-mac.zip    # <-- PRIMARY ARTIFACT
    sha512: qAVCUDPfbhRNNpKN1T9BPt/...
    size: 98835410
  - url: SlimChat-0.0.9.dmg
    sha512: JAfyck7iIrNuy9Fu4+8MH+n...
    size: 102083313
path: SlimChat-0.0.9-mac.zip        # <-- ELECTRON-UPDATER DOWNLOADS THIS
```

**Release assets (0.0.9):**
- SlimChat-0.0.9.dmg (exists)
- SlimChat-0.0.9-x86_64.AppImage (exists)
- latest-mac.yml (exists)
- latest-linux.yml (exists)
- manifest.json (exists)
- **SlimChat-0.0.9-mac.zip (MISSING - 404)**

When electron-updater tries to download `SlimChat-0.0.9-mac.zip`, it gets HTTP 404, which `sanitizeError()` converts to "Failed to fetch manifest from server".

## Root Cause
1. `package.json` configures mac build with `target: ["dmg", "zip"]`
2. electron-builder generates both `.dmg` and `.zip` files during build
3. electron-builder generates `latest-mac.yml` with `.zip` as the default `path`
4. Release workflow only uploads `*.dmg` files, not `*.zip`:
   ```yaml
   files: |
     release-artifacts/**/*.dmg         # uploaded
     release-artifacts/**/*.AppImage    # uploaded
     # *.zip NOT uploaded!
   ```
5. electron-updater reads `latest-mac.yml`, sees `path: SlimChat-x.y.z-mac.zip`, requests it, gets 404

## Fix
Update `.github/workflows/release.yml` to:
1. Copy `.zip` files during artifact consolidation (for manifest generation)
2. Upload `.zip` files in the GitHub release

**Changes made:**
- Line 84: Added `cp -v release-artifacts/**/*.zip dist/ 2>/dev/null || true`
- Line 88: Updated validation to include `.zip` in count
- Line 115: Added `release-artifacts/**/*.zip` to upload files list

## Impact
- Severity: **Critical**
- Affected Users: **All macOS users** attempting to download updates
- Affected Versions: Any release where `.zip` was not uploaded (0.0.7+)

## Verification
After deploying the fix, a new release should include:
- SlimChat-x.y.z.dmg
- SlimChat-x.y.z-mac.zip
- SlimChat-x.y.z-x86_64.AppImage
- latest-mac.yml
- latest-linux.yml
- manifest.json (with entries for all artifacts including .zip)
