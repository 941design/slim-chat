# SlimChat

Desktop app bootstrap with secure auto-updates built with Electron, React, and TypeScript.

## Features

- Secure auto-update system with cryptographic verification
- Built with Electron 30
- React 18 for the UI
- Hot reload development environment
- Comprehensive test coverage

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
2. Tag the commit with a semantic version (x.x.x format):
   ```bash
   git tag 1.0.0
   git push origin 1.0.0
   ```

3. The release workflow will automatically:
   - Run all tests
   - Build packages for Ubuntu and macOS
   - Generate and sign the update manifest
   - Create a GitHub release with all artifacts

**Important**: Only tags matching the pattern `x.x.x` (e.g., `1.0.0`, `2.1.3`) will trigger a release.

## Available Make Commands

```bash
make help               # Show all available commands
make clean              # Remove build artifacts
make install            # Install dependencies
make dev                # Start development mode
make build              # Build for production
make test               # Run unit tests
make test-watch         # Run unit tests in watch mode
make test-e2e           # Run E2E tests
make test-e2e-ui        # Run E2E tests in interactive UI mode
make test-e2e-headed    # Run E2E tests in headed mode
make test-e2e-debug     # Debug E2E tests with Playwright Inspector
make test-all           # Run all tests (unit + E2E)
make lint               # Run type checking
make package            # Create distributable packages
make release            # Full release build
make verify             # Run lint and all tests
make ci                 # CI pipeline (install, verify, build)
make dist-clean         # Deep clean including node_modules
```

## Security Features

This application includes a secure auto-update system with:
- Cryptographic signature verification using Ed25519
- Version validation
- Manifest-based update distribution
- Protection against downgrade attacks

### Ed25519 Key Setup

The auto-update system requires Ed25519 cryptographic keys for signing and verifying update manifests.

#### Generating Keys

Generate a new Ed25519 keypair using GPG:

```bash
# Generate a new Ed25519 key
gpg --quick-gen-key "SlimChat Release <release@example.com>" ed25519 sign

# List keys to get the key ID
gpg --list-keys

# Export the private key (raw 32-byte seed)
gpg --export-secret-keys --armor "SlimChat Release" | gpg --list-packets --verbose

# Extract and encode keys for the application
# Use the following helper script:
gpg --export-secret-keys "SlimChat Release" | \
  tail -c 32 | base64

# Export public key
gpg --export "SlimChat Release" | \
  tail -c 32 | base64
```

#### Configuring Keys

**For Development/Testing:**

Set the environment variable when running manifest generation:

```bash
export ED25519_PRIVATE_KEY="your-base64-private-key"
npm run package
```

**For Production/CI:**

Add the private key to your CI/CD secrets as `ED25519_PRIVATE_KEY`.

**In Application Code:**

Update the public key in your source code (location varies based on implementation) to verify downloaded manifests. The public key is safe to embed in the application binary.

#### Key Security

- **Private Key**: NEVER commit to version control. Only store in CI/CD secrets or secure key management systems.
- **Public Key**: Safe to embed in application code and distribute with binaries.
- **Key Rotation**: Generate new keypairs if private key is compromised. Users will need to update to a version with the new public key using the old signing key before rotation completes.

## License

MIT
