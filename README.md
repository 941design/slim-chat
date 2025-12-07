# SlimChat

Desktop app bootstrap with secure auto-updates built with Electron, React, and TypeScript.

## Features

- Secure auto-update system with cryptographic verification
- **Dev mode update testing** - Test updates locally before releasing to users
- **GitHub Provider hardening**:
  - Download concurrency protection (prevents race conditions)
  - File protocol support (`file://`) for local manifest testing
  - URL validation at setup time with fail-fast behavior
  - Error message sanitization (hides HTTP codes, JSON errors, field names in production)
  - Centralized GitHub constants for maintainability
- Built with Electron 30
- React 18 for the UI
- Hot reload development environment

## Installation

Install dependencies:

```bash
npm install
```

## Development

### Understanding Electron's Architecture

Electron applications consist of three distinct processes:

- **Main Process**: The Node.js backend that manages the application lifecycle, creates browser windows, and handles system-level operations (file system, auto-updates, native OS features). Has full access to Node.js APIs.

- **Preload Script**: A security bridge running in an isolated context. It selectively exposes APIs from the main process to the renderer using `contextBridge`, providing secure communication without exposing the entire Node.js environment.

- **Renderer Process**: The Chromium-based frontend (React application) that users interact with. Runs in a sandboxed environment and communicates with the main process through the preload script's exposed API.

### Start Development Mode

Run all processes (main, preload, renderer) with hot reload:

```bash
npm run dev
```

### Individual Process Development

Run specific processes independently for focused development:

```bash
# Main process only - backend development
npm run dev:main

# Preload script only - API bridge development
npm run dev:preload

# Renderer process only - frontend/UI development
npm run dev:renderer
```

## Building

### Production Build

Build the entire application:

```bash
npm run build
```

This will:
1. Clean previous build artifacts
2. Build the main process
3. Build the preload script
4. Build the renderer process

### Individual Component Builds

```bash
# Main process only
npm run build:main

# Preload script only
npm run build:preload

# Renderer process only
npm run build:renderer
```

## Testing

### Unit Tests

Run unit tests with Jest:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

### End-to-End Tests

Run E2E tests with Playwright in **headless mode** (default, no visible window):

```bash
npm run test:e2e
```

Run E2E tests in **UI mode** (interactive test runner):

```bash
npm run test:e2e:ui
```

Run E2E tests in **headed mode** (see the Electron window):

```bash
npm run test:e2e:headed
```

Debug E2E tests with **Playwright Inspector**:

```bash
npm run test:e2e:debug
```

#### Testing in Linux Environment (Docker)

On macOS, you can simulate the GitHub Actions Ubuntu CI environment using Docker to verify that E2E tests will pass on Linux:

```bash
# Run E2E tests in Docker container (simulates Ubuntu CI)
npm run test:e2e:docker

# Clean up Docker resources and test artifacts
npm run test:e2e:docker:clean
```

**Prerequisites**: Docker Desktop must be installed and running.

**What this does**:
- Builds a Ubuntu 22.04 container matching the GitHub Actions runner
- Installs Xvfb (X Virtual Frame Buffer) for headless GUI testing
- Runs the complete E2E test suite with the same flags as CI
- Mounts `test-results/` and `playwright-report/` for local inspection

This is useful for:
- Debugging Linux-specific test failures before pushing
- Verifying fixes for CI issues locally
- Testing display server configurations

## Dev Mode Update Testing

Test the auto-update system in development mode before releasing to users.

> **Detailed Guide**: See [docs/dev-mode-update-testing.md](docs/dev-mode-update-testing.md) for comprehensive documentation including local manifest testing, upstream release testing, and troubleshooting.

### Quick Start

Run the app in dev mode:

```bash
npm run dev
```

The update system will automatically use dev mode configuration when `VITE_DEV_SERVER_URL` is set (which `npm run dev` does automatically).

### Configuration

Configure update testing via environment variables:

```bash
# Enable dev mode updates (auto-enabled when running npm run dev)
VITE_DEV_SERVER_URL=http://localhost:5173

# Test against a specific GitHub release
DEV_UPDATE_SOURCE=https://github.com/941design/slim-chat/releases/download/1.0.0

# Enable pre-release version testing (beta, alpha, rc)
ALLOW_PRERELEASE=true
```

### Testing Workflow

**Using Make (recommended)**:

```bash
# Basic dev mode (auto-enabled)
make dev

# Test against specific GitHub release
DEV_UPDATE_SOURCE=https://github.com/941design/slim-chat/releases/download/1.0.1 make dev-update-release

# Test pre-release versions (beta, alpha, rc)
make dev-update-prerelease

# Test with local manifest files (file:// protocol)
DEV_UPDATE_SOURCE=file:///tmp/test-updates make dev-update-local
```

**Using npm directly**:

```bash
# Basic dev mode (auto-enabled)
npm run dev

# Test against specific GitHub release
export DEV_UPDATE_SOURCE="https://github.com/941design/slim-chat/releases/download/1.0.1"
npm run dev

# Test pre-release versions
export ALLOW_PRERELEASE=true
npm run dev

# Test with local manifest files (file:// protocol - dev mode only)
export DEV_UPDATE_SOURCE="file:///path/to/local/manifest"
npm run dev
```

**Verify the update flow**:
1. Click "Check for Updates" in the app to trigger the update check
2. Check state transitions (idle → checking → available → downloading → verifying → ready)
3. Verify cryptographic signature validation
4. Test download and installation process

### Production Safety

**Important**: Dev mode features are automatically disabled in production builds:
- Pre-release versions are blocked
- Custom update sources are ignored
- File protocol (`file://`) URLs are rejected
- All updates use official GitHub releases with HTTPS
- Full cryptographic verification is always enforced
- Error messages are sanitized (no HTTP codes, JSON errors, or field names exposed)

**Error Sanitization**: In production mode, error messages are automatically sanitized to prevent information leakage:
- HTTP status codes hidden (e.g., "Failed to fetch manifest" instead of "HTTP 404")
- JSON parse errors generalized (e.g., "Invalid format" instead of parser details)
- Manifest field names not exposed (e.g., "Validation failed" instead of field list)
- Dev mode preserves full error details for debugging

## Code Quality

Run type checking:

```bash
npm run lint
```

## Packaging

Create distributable packages:

```bash
npm run package
```

This will create platform-specific distributables:
- **macOS**: DMG and ZIP files
- **Linux**: AppImage

## Installing Releases

### macOS

**Note**: This app is not notarized with Apple. macOS Gatekeeper will block it on first launch with a message like:

> *"SlimChat" cannot be opened because Apple could not verify it is free of malware.*

To install and run:

1. Download the `.dmg` file from the GitHub release
2. Open the DMG and drag `SlimChat.app` to **Applications**
3. Try opening the app once (it will fail with the warning)
4. Go to **System Settings → Privacy & Security**
5. Scroll down to find:
   > `"SlimChat" was blocked from use because it is not from an identified developer`
6. Click **"Allow Anyway"**
7. Open the app again and click **"Open"** in the dialog

**Alternative - Right-click method**:
1. Right-click the app in Applications → **Open**
2. Click **Open** in the warning dialog

**Alternative - Terminal** (removes quarantine flag):
```bash
xattr -rd com.apple.quarantine /Applications/SlimChat.app
```

### Linux

1. Download the `.AppImage` file from the GitHub release
2. Make it executable:
   ```bash
   chmod +x SlimChat-*.AppImage
   ```
3. Run it:
   ```bash
   ./SlimChat-*.AppImage
   ```

**Optional**: Move to a permanent location:
```bash
mv SlimChat-*.AppImage ~/.local/bin/slimchat
```

## Log Files

Application logs are written to `app.log` in the user data directory:

| Platform | Path |
|----------|------|
| **macOS** | `~/Library/Application Support/SlimChat/logs/app.log` |
| **Linux** | `~/.config/SlimChat/logs/app.log` |

Logs are stored as JSON Lines format with `level`, `message`, and `timestamp` fields.

## Release Process

### Local Release Build

Generate a complete release build locally:

```bash
make release
```

This will:
1. Clean all build artifacts
2. Install dependencies
3. Build the application
4. Package the application
5. Generate and sign the update manifest

Artifacts will be available in the `release/` directory.

### Automated Releases via GitHub Actions

The project uses GitHub Actions for continuous integration and automated releases:

#### Continuous Integration

Every push to any branch triggers the test workflow, which:
- Runs on Ubuntu and macOS
- Tests against Node.js 18.x and 20.x
- Executes linting, tests, and builds to ensure code quality

#### Creating a Release

To create an automated release:

1. Ensure all changes are committed and pushed
2. Bump version and create tag using Make commands (recommended):
   ```bash
   make version-patch   # or version-minor, version-major
   git push && git push --tags
   ```

   Or manually tag (ensure it matches `package.json` version):
   ```bash
   git tag 1.0.0
   git push origin 1.0.0
   ```

3. The release workflow will automatically:
   - Run all tests
   - Build packages for Ubuntu and macOS
   - Generate and sign the update manifest
   - Create a GitHub release with all artifacts

**Important - Tag Format**: Tags must be `x.x.x` format **without a 'v' prefix** (e.g., `1.0.0`, not `v1.0.0`). Only tags matching this pattern trigger releases. The `make version-*` commands handle this automatically.

## Available Make Commands

```bash
make help                    # Show all available commands
make clean                   # Remove build artifacts
make install                 # Install dependencies
make dev                     # Start development mode
make build                   # Build for production
make test                    # Run unit tests
make test-watch              # Run unit tests in watch mode
make test-e2e                # Run E2E tests
make test-e2e-ui             # Run E2E tests in interactive UI mode
make test-e2e-headed         # Run E2E tests in headed mode
make test-e2e-debug          # Debug E2E tests with Playwright Inspector
make test-e2e-docker         # Run E2E tests in Docker (simulates Ubuntu CI)
make test-e2e-docker-clean   # Clean up Docker resources and test artifacts
make test-all                # Run all tests (unit + E2E)
make lint                    # Run type checking
make package                 # Create distributable packages
make release                 # Full release build
make verify                  # Run lint and all tests
make ci                      # CI pipeline (install, verify, build)
make dist-clean              # Deep clean including node_modules

# Dev mode update testing
make dev-update-release      # Test against specific GitHub release (set DEV_UPDATE_SOURCE)
make dev-update-prerelease   # Test pre-release updates (beta, alpha, rc)
make dev-update-local        # Test with local file:// manifest (dev mode only)

# Version upgrade testing (local release workflow)
make local-release           # Package HEAD into ./local-release for testing
make local-release-clean     # Remove local release directory
make test-version-upgrade    # Show interactive guide for version upgrade testing
```

## Security Features

This application includes a secure auto-update system with:
- Cryptographic signature verification using RSA-4096
- Version validation
- Manifest-based update distribution
- Protection against downgrade attacks

For RSA key generation and configuration, see [docs/rsa-key-setup.md](docs/rsa-key-setup.md).

## License

MIT

