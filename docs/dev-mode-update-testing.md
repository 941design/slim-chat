# Dev Mode Update Testing Guide

This guide explains how to test the auto-update system in development mode before releasing to users.

## Overview

The Nostling auto-update system supports three testing modes:

1. **Local Manifest Testing** (`file://`) - Test with local files, no network required
2. **Upstream Release Testing** (`https://`) - Test against real GitHub releases
3. **Pre-release Testing** - Test beta, alpha, and release candidate versions

All dev mode features are automatically disabled in production builds for security.

---

## Prerequisites

- Node.js 18+ installed
- Dependencies installed (`npm install`)
- For signing manifests: RSA private key available

---

## Quick Start

```bash
# Basic dev mode (checks latest GitHub release)
make dev

# Test against specific GitHub release
DEV_UPDATE_SOURCE=https://github.com/941design/nostling/releases/download/1.0.1 make dev-update-release

# Test with local manifest files
DEV_UPDATE_SOURCE=file:///tmp/test-updates make dev-update-local

# Test pre-release versions
make dev-update-prerelease
```

---

## 1. Local Manifest Testing (file:// protocol)

Local manifest testing is ideal for:
- Fast iteration without network dependencies
- Testing manifest parsing and validation
- Testing signature verification
- Simulating various update scenarios

### Step 1: Create Test Directory

```bash
mkdir -p /tmp/test-updates
```

### Step 2: Create a Test Manifest

#### Option A: Unsigned manifest (for basic testing)

Create a minimal manifest to test parsing:

```bash
cat > /tmp/test-updates/manifest.json << 'EOF'
{
  "version": "99.0.0",
  "artifacts": [
    {
      "url": "Nostling-99.0.0.dmg",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "platform": "darwin",
      "type": "dmg"
    },
    {
      "url": "Nostling-99.0.0.AppImage",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "platform": "linux",
      "type": "AppImage"
    }
  ],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "signature": "INVALID_SIGNATURE_FOR_TESTING"
}
EOF
```

> **Note**: Signature verification will fail with an invalid signature. Use Option B for full flow testing.

#### Option B: Properly signed manifest (recommended)

For signature verification to pass, sign the manifest with your private key:

```bash
# Set your private key (using gopass, or export directly)
export NOSTLING_RSA_PRIVATE_KEY=$(gopass show nostling/nostling-release.key)

# Generate signed manifest
node -e "
const crypto = require('crypto');
const fs = require('fs');

const manifest = {
  version: '99.0.0',
  artifacts: [
    {
      url: 'Nostling-99.0.0.dmg',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      platform: 'darwin',
      type: 'dmg'
    },
    {
      url: 'Nostling-99.0.0.AppImage',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      platform: 'linux',
      type: 'AppImage'
    }
  ],
  createdAt: new Date().toISOString()
};

const signer = crypto.createSign('SHA256');
signer.update(JSON.stringify(manifest, null, 0));
const signature = signer.sign(process.env.NOSTLING_RSA_PRIVATE_KEY, 'base64');

const signed = { ...manifest, signature };
fs.writeFileSync('/tmp/test-updates/manifest.json', JSON.stringify(signed, null, 2));
console.log('Signed manifest created at /tmp/test-updates/manifest.json');
console.log('Version:', signed.version);
console.log('Artifacts:', signed.artifacts.length);
"
```

### Step 3: Run with Local Manifest

```bash
# Using Make (recommended)
DEV_UPDATE_SOURCE=file:///tmp/test-updates make dev-update-local

# Using npm directly
export DEV_UPDATE_SOURCE="file:///tmp/test-updates"
npm run dev
```

### Step 4: Verify the Update Flow

1. App launches in dev mode
2. Click "Check for Updates" in the UI
3. App fetches `file:///tmp/test-updates/manifest.json`
4. If manifest version > current app version, shows "Update Available"
5. Signature is verified against the embedded public key
6. Download will fail (no actual artifact) - this is expected for manifest-only testing

### Testing Different Scenarios

```bash
# Test "no update available" (set version lower than current)
# Edit manifest.json and set "version": "0.0.1"

# Test "update available" (set version higher than current)
# Edit manifest.json and set "version": "99.0.0"

# Test signature failure
# Edit manifest.json and corrupt the signature field

# Test malformed manifest
# Remove required fields from manifest.json
```

---

## 2. Upstream Release Testing (GitHub)

Test against real GitHub releases to verify the complete update flow.

### List Available Releases

```bash
# Using GitHub CLI
gh release list --repo 941design/nostling

# Or visit: https://github.com/941design/nostling/releases
```

### Test Against Specific Release

```bash
# Format: https://github.com/{owner}/{repo}/releases/download/{tag}
DEV_UPDATE_SOURCE=https://github.com/941design/nostling/releases/download/1.0.1 make dev-update-release
```

### Test Against Latest Release

```bash
# Default behavior - checks /releases/latest/download/manifest.json
make dev

# Or explicitly unset any custom source
unset DEV_UPDATE_SOURCE
npm run dev
```

### URL Structure

The app constructs manifest URLs as follows:

| Mode | URL Pattern |
|------|-------------|
| Production (default) | `https://github.com/941design/nostling/releases/latest/download/manifest.json` |
| Specific release | `{DEV_UPDATE_SOURCE}/manifest.json` |
| Local file | `file:///path/to/directory/manifest.json` |

**Examples:**
```
# Latest release
https://github.com/941design/nostling/releases/latest/download/manifest.json

# Specific version
https://github.com/941design/nostling/releases/download/1.0.1/manifest.json

# Local file
file:///tmp/test-updates/manifest.json
```

---

## 3. Pre-release Testing

Test beta, alpha, and release candidate versions.

### Enable Pre-release Checking

```bash
# Using Make
make dev-update-prerelease

# Using npm
ALLOW_PRERELEASE=true npm run dev
```

### Combined with Specific Source

```bash
# Test a specific pre-release
ALLOW_PRERELEASE=true DEV_UPDATE_SOURCE=https://github.com/941design/nostling/releases/download/2.0.0-beta.1 npm run dev
```

### Pre-release Version Formats

Supported pre-release tags:
- `2.0.0-alpha.1`
- `2.0.0-beta.1`
- `2.0.0-rc.1`

---

## Configuration Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_DEV_SERVER_URL` | Dev server URL (auto-set by `npm run dev`) | - |
| `DEV_UPDATE_SOURCE` | Custom update source URL | GitHub latest |
| `ALLOW_PRERELEASE` | Enable pre-release versions | `false` |
| `FORCE_DEV_UPDATE_CONFIG` | Force dev mode even in packaged app | `false` |

### Make Targets

| Target | Description |
|--------|-------------|
| `make dev` | Start dev mode (checks latest GitHub release) |
| `make dev-update-release` | Test against specific release (requires `DEV_UPDATE_SOURCE`) |
| `make dev-update-prerelease` | Enable pre-release version checking |
| `make dev-update-local` | Test with local file:// manifest (requires `DEV_UPDATE_SOURCE`) |

---

## Manifest Structure

A valid signed manifest has this structure:

```json
{
  "version": "1.0.1",
  "artifacts": [
    {
      "url": "Nostling-1.0.1.dmg",
      "sha256": "abc123def456...",
      "platform": "darwin",
      "type": "dmg"
    },
    {
      "url": "Nostling-1.0.1.AppImage",
      "sha256": "789ghi012jkl...",
      "platform": "linux",
      "type": "AppImage"
    }
  ],
  "createdAt": "2025-01-15T10:30:00.000Z",
  "signature": "BASE64_RSA_SIGNATURE..."
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Semantic version (e.g., "1.0.1") |
| `artifacts` | array | List of downloadable artifacts |
| `artifacts[].url` | string | Filename of the artifact |
| `artifacts[].sha256` | string | SHA-256 hash (lowercase hex, 64 chars) |
| `artifacts[].platform` | string | Target platform: `darwin`, `linux`, or `win32` |
| `artifacts[].type` | string | Artifact type: `dmg`, `zip`, `AppImage`, or `exe` |
| `createdAt` | string | ISO 8601 timestamp |
| `signature` | string | Base64-encoded RSA-SHA256 signature |

### Signature Computation

The signature is computed over the canonical JSON of `{version, artifacts, createdAt}`:

```javascript
const unsigned = { version, artifacts, createdAt };
const canonicalJson = JSON.stringify(unsigned, null, 0);  // No whitespace
const signer = crypto.createSign('SHA256');
signer.update(canonicalJson);
const signature = signer.sign(privateKey, 'base64');
```

---

## Complete Testing Workflow

Recommended testing sequence before releasing:

```bash
# 1. Fast iteration with local manifest
DEV_UPDATE_SOURCE=file:///tmp/test-updates make dev-update-local

# 2. Verify against known good release
DEV_UPDATE_SOURCE=https://github.com/941design/nostling/releases/download/1.0.0 make dev-update-release

# 3. Test latest release (production-like)
make dev

# 4. Test pre-release flow (if applicable)
make dev-update-prerelease

# 5. Build production and verify safety
npm run build && npm run package
# Run packaged app - DEV_UPDATE_SOURCE should be ignored
```

---

## Troubleshooting

### "Manifest URL must use HTTPS protocol"

**Cause**: Trying to use `file://` in production mode.

**Solution**: Ensure dev mode is active (`VITE_DEV_SERVER_URL` is set). Use `npm run dev` or `make dev`.

### "Signature verification failed"

**Cause**: Manifest signature doesn't match public key.

**Solutions**:
1. Regenerate manifest with correct private key
2. Ensure public key in `src/main/index.ts` matches your keypair
3. Check manifest wasn't modified after signing

### "Update available" but download fails

**Cause**: Local manifest testing only validates the manifest, not actual downloads.

**Solution**: This is expected for local testing. Use GitHub releases for full download testing.

### Dev mode not activating

**Cause**: `VITE_DEV_SERVER_URL` not set.

**Solutions**:
1. Use `npm run dev` (sets it automatically)
2. Manually set: `VITE_DEV_SERVER_URL=http://localhost:5173 npm run dev`

### Custom source ignored in production

**Cause**: Production builds ignore `DEV_UPDATE_SOURCE` for security.

**Solution**: This is intentional. Use dev mode for custom source testing.

---

## Security Considerations

### Production Safety

Dev mode features are **automatically disabled** in production builds:

- `file://` URLs are rejected
- `DEV_UPDATE_SOURCE` is ignored
- `ALLOW_PRERELEASE` is ignored
- Only official GitHub releases with HTTPS are used
- Full cryptographic verification is always enforced

### Error Message Sanitization

In production mode, error messages are sanitized to prevent information leakage:

| Dev Mode | Production Mode |
|----------|-----------------|
| "Manifest request failed with status 404" | "Failed to fetch manifest from server" |
| "Failed to parse JSON: Unexpected token" | "Manifest format is invalid" |
| "Missing required fields: signature" | "Manifest validation failed" |

### Key Security

- **Private Key**: Never commit to version control. Store in CI/CD secrets only.
- **Public Key**: Safe to embed in application code.
- **Key Rotation**: If private key is compromised, generate new keypair and release signed with old key first.

---

## 4. Version Upgrade Testing (Local Release Workflow)

This workflow tests real version upgrades by packaging HEAD and running an older version against it.

### Use Case

Test that older app versions can successfully upgrade to the current HEAD:
- Verify backward compatibility
- Test migration paths
- Validate manifest changes across versions

### Quick Start

```bash
# See the interactive guide
make test-version-upgrade
```

### Step-by-Step Workflow

#### Step 1: Package HEAD as Local Release

```bash
# Set your signing key
export NOSTLING_RSA_PRIVATE_KEY=$(gopass show nostling/nostling-release.key)

# Build, package, and sign current HEAD
make local-release
```

This creates `./local-release/` containing:
- `manifest.json` (signed)
- `Nostling-x.x.x.dmg` (macOS)
- `Nostling-x.x.x.AppImage` (Linux)
- `Nostling-x.x.x.zip` (macOS zip)

#### Step 2: Checkout Older Version

```bash
# List available tags
git tag --sort=-creatordate | head -10

# Stash any uncommitted changes
git stash

# Checkout older version
git checkout 1.0.0
```

#### Step 3: Install Dependencies for Older Version

```bash
npm install
```

#### Step 4: Run Older Version with Local Release Source

```bash
# Point to your local release
DEV_UPDATE_SOURCE=file://$PWD/local-release make dev-update-local
```

#### Step 5: Test the Update Flow

1. App launches (running old version, e.g., 1.0.0)
2. Click "Check for Updates"
3. App discovers new version from local release
4. Verify update notification shows correct version
5. Test download (may fail if artifacts don't match platform)
6. Verify signature validation works

#### Step 6: Return to HEAD

```bash
# Return to previous branch
git checkout -

# Restore stashed changes (if any)
git stash pop

# Reinstall dependencies
npm install

# Clean up local release (optional)
make local-release-clean
```

### Custom Output Directory

```bash
# Use a different directory
LOCAL_RELEASE_DIR=/tmp/my-release make local-release

# Test against it
DEV_UPDATE_SOURCE=file:///tmp/my-release make dev-update-local
```

### Example Session

```bash
# Terminal session example
$ export NOSTLING_RSA_PRIVATE_KEY=$(gopass show nostling/nostling-release.key)

$ make local-release
Building and packaging current HEAD...
Output directory: /Users/me/nostling/local-release
...
Local release created at: /Users/me/nostling/local-release

Contents:
-rw-r--r--  1 me  staff   156M Dec  7 16:00 Nostling-0.0.0.dmg
-rw-r--r--  1 me  staff   1.2K Dec  7 16:00 manifest.json

Version in manifest:
  "version": "0.0.0",

To test version upgrade:
  1. git stash (if needed)
  2. git checkout <older-version-tag>
  3. npm install
  4. DEV_UPDATE_SOURCE=file:///Users/me/nostling/local-release make dev-update-local
  5. Click 'Check for Updates' in the app

$ git stash
$ git checkout 0.0.1-beta
$ npm install
$ DEV_UPDATE_SOURCE=file://$PWD/local-release make dev-update-local
# App launches, showing 0.0.1-beta
# Click "Check for Updates"
# App discovers 0.0.2 (HEAD version) available
# Update flow proceeds...

$ git checkout -
$ npm install
$ make local-release-clean
```

### Troubleshooting

#### "NOSTLING_RSA_PRIVATE_KEY is required"

Set the environment variable before running:
```bash
export NOSTLING_RSA_PRIVATE_KEY=$(gopass show nostling/nostling-release.key)
# or
export NOSTLING_RSA_PRIVATE_KEY=$(cat /path/to/private-key.pem)
```

#### "No artifacts found"

Ensure `npm run package` completed successfully. Check `dist/` for:
- `.dmg` files (macOS)
- `.AppImage` files (Linux)

#### Old version can't find local release

Ensure the path is correct:
```bash
# Use absolute path
DEV_UPDATE_SOURCE=file:///absolute/path/to/local-release make dev-update-local

# Or use $PWD for current directory
DEV_UPDATE_SOURCE=file://$PWD/local-release make dev-update-local
```

#### Signature verification fails

Ensure the private key used for signing matches the public key embedded in the old version's code. If keys were rotated between versions, this test may fail (expected behavior).

---

## See Also

- [README.md](../README.md) - Main project documentation
- [Security Features](../README.md#security-features) - RSA key setup and security overview
- [Release Process](../README.md#release-process) - How to create releases
