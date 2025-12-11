# Manifest Missing macOS Artifact - Bug Report

## Bug Description
When version 0.0.6 attempts to update to version 0.0.7, the update fails with error "Failed to fetch manifest from server" on macOS systems. The root cause is that the generated `manifest.json` file only contains the Linux artifact and is missing the macOS (.dmg) artifact, even though the .dmg file exists in the GitHub release.

## Expected Behavior
The `manifest.json` file should contain artifacts for all platforms (both Linux and macOS), allowing the update mechanism to:
1. Successfully fetch the manifest from GitHub releases
2. Verify the RSA signature
3. Find the platform-appropriate artifact (macOS .dmg)
4. Download and verify the update

## Reproduction Steps
1. Run Nostling version 0.0.6 on macOS
2. Check for updates (update detection shows 0.0.7 available)
3. Attempt to download update
4. Observe error: "Failed to fetch manifest from server"

## Actual Behavior
Error logs show:
```json
{"level":"info","message":"Update available: 0.0.7","timestamp":"2025-12-07T19:37:30.360Z"}
{"level":"error","message":"Updater error: Failed to fetch manifest from server","timestamp":"2025-12-07T19:37:31.679Z"}
```

Inspecting the manifest at `https://github.com/941design/nostling/releases/download/0.0.7/manifest.json` reveals:
```json
{
  "version": "0.0.7",
  "artifacts": [
    {
      "url": "Nostling-0.0.7-x86_64.AppImage",
      "sha256": "b26d99fede7a4919d3973285c1617e435c0c6cc76b7c3be9370b4231ace6bad2",
      "platform": "linux",
      "type": "AppImage"
    }
  ],
  "createdAt": "2025-12-07T19:34:32.639Z",
  "signature": "..."
}
```

The macOS artifact is missing, but the file exists in the release:
- `Nostling-0.0.7.dmg` (102,082,984 bytes) - exists in release assets
- Entry for this .dmg is missing from manifest.json

## Impact
- Severity: **Critical**
- Affected Users: **All macOS users** running version 0.0.6 or earlier
- Affected Workflows: **Auto-update mechanism is completely broken for macOS**

## Environment/Context
- Application version: 0.0.6 attempting to update to 0.0.7
- Platform: macOS (darwin)
- Update mechanism: RSA-signed manifest with GitHub releases
- CI/CD: GitHub Actions with matrix build (ubuntu-latest, macos-13)

## Root Cause Hypothesis
The manifest generation step in the GitHub Actions release workflow only runs on the ubuntu-latest runner:

**File:** `.github/workflows/release.yml:50-52`
```yaml
- name: Generate manifest (linux only)
  if: matrix.os == 'ubuntu-latest'
  run: npm run sign:manifest
```

**Problem:**
1. The build matrix creates artifacts on two separate runners (ubuntu-latest and macos-13)
2. Each runner has its own isolated `dist/` directory
3. ubuntu-latest dist/ contains: Nostling-*.AppImage
4. macos-13 dist/ contains: Nostling-*.dmg
5. Manifest generation runs **only on ubuntu-latest**
6. The manifest script (`scripts/generate-manifest.ts`) reads from `dist/` directory
7. Since only Linux artifacts are present in ubuntu's dist/, only Linux artifacts are included in manifest.json

**Expected vs Actual:**
- Expected: Manifest generated after all platform artifacts are collected
- Actual: Manifest generated on single platform with access only to that platform's artifacts

## Constraints
- Backward compatibility: Existing 0.0.6 clients must be able to update once fix is deployed
- Security: RSA signature must cover all artifacts in manifest
- CI/CD: Must work within GitHub Actions matrix build constraints
- No breaking changes to manifest structure or verification logic

## Codebase Context

### Likely location of fix:
- `.github/workflows/release.yml` - Workflow needs modification to generate manifest after all artifacts are collected

### Related code:
- `scripts/generate-manifest.ts` - Manifest generation script (correctly processes all artifacts in dist/)
- `src/main/integration.ts` - Manifest fetching and validation (working correctly)
- `src/main/security/verify.ts` - RSA signature verification (working correctly)

### Recent changes:
- Commit `eaf1a75`: Version 0.0.7 release (manifest only contains Linux artifact)
- Commit `74b3ff7`: "using github manifest (2)" - switched to GitHub-based manifest approach
- Commit `f248a42`: "using github manifesst" - initial GitHub manifest implementation

### Similar patterns in codebase:
The release workflow already handles artifact collection from multiple runners:
```yaml
- name: Download all artifacts
  uses: actions/download-artifact@v4
  with:
    path: release-artifacts
```

This step correctly downloads artifacts from all matrix build jobs into a unified directory structure. The manifest generation should happen **after** this step, not during the individual platform builds.

## Out of Scope
- Refactoring unrelated CI/CD steps
- Changing manifest structure or verification logic
- Performance optimizations beyond the fix
- Improvements to error messages or logging
- Support for additional platforms (Windows)
