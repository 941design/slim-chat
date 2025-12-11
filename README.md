# Nostling

A desktop messaging application built on the Nostr protocol with secure auto-updates, built with Electron, React, and TypeScript.

## TODO

+ disallow pushing tags on branches other than master
+ identity
  + create
  + remove
+ contacts
  + add
	+ scan
    + paste
  + remove
+ messages
  + show
  + send
+ group chat
  + add member (adding a member creates new id (deterministically?), and starts new chat)
  +

## Features

- **Nostr encrypted messaging** with NIP-04 encryption via nostr-tools
- **Identity management** - Create/import identities from nsec keys
- **Contact whitelist** - Only receive messages from known contacts
- **Relay connectivity** - WebSocket connections to Nostr relays with auto-reconnection
- **Offline support** - Queue messages when offline, publish when connectivity restored
- **Secure auto-updates** with RSA-4096 cryptographic verification
- **Auto-update footer** with real-time progress, configurable check intervals, and manual refresh
- **Persistence layer** with SQLite database and automatic schema migrations
- **Cross-platform** support for macOS and Linux
- **Dev mode testing** for validating updates before release
- Built with Electron 30, React 18, and TypeScript

## Quick Start

```bash
npm install
npm run dev
```

## Installation

### macOS

This app is not notarized with Apple. On first launch, macOS will block it.

1. Download the `.dmg` from the [latest release](https://github.com/941design/nostling/releases/latest)
2. Open the DMG and drag `Nostling.app` to **Applications**
3. Try opening the app (it will fail with a warning)
4. Go to **System Settings → Privacy & Security**
5. Find the blocked app message and click **"Allow Anyway"**
6. Open the app again and click **"Open"**

**Alternative**: Right-click the app → **Open** → **Open**, or run:
```bash
xattr -rd com.apple.quarantine /Applications/Nostling.app
```

### Linux

1. Download the `.AppImage` from the [latest release](https://github.com/941design/nostling/releases/latest)
2. Make executable and run:
   ```bash
   chmod +x Nostling-*.AppImage
   ./Nostling-*.AppImage
   ```

## Development

### Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start with hot reload |
| `make build` | Production build |
| `make test` | Unit tests |
| `make test-e2e` | End-to-end tests |
| `make lint` | Type checking |
| `make package` | Create distributable packages |
| `make release` | Full release build |

Run `make help` for all available commands.

### Individual Process Development

```bash
npm run dev:main      # Main process only
npm run dev:preload   # Preload script only
npm run dev:renderer  # Frontend only
```

### Testing

```bash
npm test                    # Unit tests
npm run test:watch          # Watch mode
npm run test:e2e            # E2E tests (headless)
npm run test:e2e:ui         # E2E interactive runner
npm run test:e2e:headed     # E2E with visible window
npm run test:e2e:debug      # E2E with Playwright Inspector
npm run test:e2e:docker     # E2E in Docker (simulates CI)
```

### Dev Mode Update Testing

Test the auto-update system locally before releasing:

```bash
# Basic dev mode
make dev

# Test against specific release
DEV_UPDATE_SOURCE=https://github.com/941design/nostling/releases/download/1.0.0 make dev

# Test with local manifest
DEV_UPDATE_SOURCE=file:///tmp/test-updates make dev

# Test pre-release versions
ALLOW_PRERELEASE=true make dev
```

See [docs/dev-mode-update-testing.md](docs/dev-mode-update-testing.md) for comprehensive testing guide.

## Building & Packaging

### Production Build

```bash
npm run build
```

### Create Packages

```bash
npm run package
```

Creates platform-specific distributables:
- **macOS**: DMG and ZIP
- **Linux**: AppImage

## Release Process

### Creating a Release

1. Bump version (creates tag without 'v' prefix):
   ```bash
   make version-patch   # or version-minor, version-major
   ```

2. Push to trigger automated release:
   ```bash
   git push && git push --tags
   ```

The GitHub Actions workflow will build packages, sign the manifest, and create the release.

**Important**: Tags must be `x.x.x` format (e.g., `1.0.0`), not `v1.0.0`.

### Local Release Build

```bash
make release
```

Artifacts will be in the `release/` directory.

## Configuration

The app stores configuration and data in:
- **macOS**: `~/Library/Application Support/Nostling/`
- **Linux**: `~/.config/Nostling/`

Files:
- `config.json` - Application configuration
- `nostling.db` - SQLite database for application state

## Log Files

Logs are written to:
- **macOS**: `~/Library/Application Support/Nostling/logs/app.log`
- **Linux**: `~/.config/Nostling/logs/app.log`

Format: JSON Lines with `level`, `message`, and `timestamp` fields.

## Security

- **RSA-4096 signature verification** on all update manifests
- **SHA-256 hash verification** on downloaded artifacts
- **Version validation** prevents downgrade attacks
- **HTTPS-only** update delivery in production

For RSA key setup, see [docs/rsa-key-setup.md](docs/rsa-key-setup.md).

### macOS Code Signing

This app is intentionally unsigned (`identity: null`). This avoids Gatekeeper issues with ad-hoc signatures on auto-updated apps. Users approve the app once during installation; subsequent updates work without additional prompts.

## Documentation

- [Architecture](docs/architecture.md) - Technical architecture and design
- [Dev Mode Update Testing](docs/dev-mode-update-testing.md) - Testing auto-updates locally
- [RSA Key Setup](docs/rsa-key-setup.md) - Cryptographic key configuration
- [E2E Tests](e2e/README.md) - End-to-end test documentation

## License

MIT
