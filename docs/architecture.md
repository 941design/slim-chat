# Architecture

This document describes the technical architecture of Nostling.

## Electron Process Model

Nostling follows Electron's three-process architecture:

### Main Process

The Node.js backend that manages the application lifecycle, creates browser windows, and handles system-level operations.

**Responsibilities:**
- Application lifecycle management
- Window creation and management
- Auto-update orchestration and cryptographic verification
- IPC request handling
- File system access (config, logs)
- macOS DMG installation handling

**Key modules:**
- `src/main/index.ts` - Entry point, lifecycle management
- `src/main/update/` - Update controller and platform-specific handlers
- `src/main/security/` - RSA signature and hash verification
- `src/main/ipc/` - IPC handler registration
- `src/main/config.ts` - Configuration management
- `src/main/logging.ts` - Structured logging

### Preload Script

A security bridge running in an isolated context that selectively exposes APIs from the main process to the renderer.

**Security configuration:**
- `contextIsolation: true` - Isolated JavaScript context
- `nodeIntegration: false` - No Node.js APIs in renderer

**Exposed API:**
```typescript
window.api = {
  updates: {
    checkNow(): Promise<void>;
    downloadUpdate(): Promise<void>;
    restartToUpdate(): Promise<void>;
    onUpdateState(callback): () => void;
  },
  config: {
    get(): Promise<AppConfig>;
    set(config): Promise<AppConfig>;
  },
  system: {
    getStatus(): Promise<AppStatus>;
  }
}
```

### Renderer Process

The React application that users interact with. Runs in a sandboxed Chromium environment and communicates with the main process through the preload script's exposed API.

**Stack:**
- React 18 with hooks
- Chakra UI v3 for components
- TypeScript with strict mode
- Vite for bundling

## Directory Structure

```
src/
├── main/           # Main process (Node.js)
│   ├── index.ts    # Entry point
│   ├── config.ts   # Configuration
│   ├── logging.ts  # Logging system
│   ├── ipc/        # IPC handlers
│   ├── security/   # Crypto verification
│   └── update/     # Update management
├── preload/        # Preload script
│   └── index.ts    # API bridge
├── renderer/       # React frontend
│   ├── main.tsx    # React root
│   └── index.html  # HTML entry
└── shared/         # Shared types
    └── types.ts    # TypeScript definitions
```

## IPC Communication

IPC channels use domain-prefixed naming:

| Channel | Purpose |
|---------|---------|
| `system:get-status` | Get app status, logs, update state |
| `updates:check` | Trigger update check |
| `updates:download` | Start download |
| `updates:restart` | Apply update and restart |
| `config:get` | Get configuration |
| `config:set` | Update configuration |
| `update-state` | Broadcast state changes |

## Update System

### State Machine

The update system operates as a state machine with these phases:

1. `idle` - No update activity
2. `checking` - Checking for updates
3. `available` - Update found, awaiting user action
4. `downloading` - Download in progress
5. `downloaded` - Download complete
6. `verifying` - Cryptographic verification
7. `ready` - Verified and ready to install
8. `failed` - Error occurred

**macOS-specific phases:**
- `mounting` - DMG being mounted
- `mounted` - Finder window open for installation

### Verification Flow

1. electron-updater downloads the artifact
2. Fetch `manifest.json` from the release
3. Verify RSA-4096 signature on manifest
4. Validate version is newer than current
5. Compute SHA-256 hash of downloaded file
6. Compare hash with manifest entry
7. Apply update only if all checks pass

### Concurrency Protection

The update system includes guards to prevent race conditions:
- Only one update check at a time
- Only one download at a time
- Manual refresh disabled during active operations

## Build System

### Build Tools

| Tool | Purpose |
|------|---------|
| tsup | Bundles main and preload processes |
| Vite | Bundles renderer (React app) |
| electron-builder | Creates distributable packages |

### Build Configuration

**tsup** (`tsup.config.ts`):
- Target: Node 18
- Embeds RSA public key at build time
- External: electron, electron-updater

**Vite** (`vite.renderer.config.ts`):
- Port: 5173 (dev server)
- React plugin enabled
- Output: `dist/renderer`

### Output Structure

```
dist/
├── main/           # Main process bundle
├── preload/        # Preload script bundle
└── renderer/       # React app (HTML, JS, CSS)

release/            # After packaging
├── Nostling-x.y.z.dmg      # macOS installer
├── Nostling-x.y.z.zip      # macOS zip
├── Nostling-x.y.z.AppImage # Linux portable
└── manifest.json           # Signed manifest
```

## Security Model

### Renderer Isolation

- No direct Node.js access from renderer
- All system operations via IPC
- Typed channels with input validation
- No generic eval or dynamic code loading

### Update Security

- RSA-4096 signature verification on manifests
- SHA-256 hash verification on artifacts
- Version validation (no downgrades)
- HTTPS-only in production
- Error messages sanitized in production

### Key Management

- **Private key**: CI secret only, never in repo
- **Public key**: Embedded at build time from `keys/nostling-release.pub`
- Override via `RSA_PUBLIC_KEY` environment variable for testing

## Platform-Specific Handling

### macOS

- Uses manual DMG installation (bypasses Squirrel.Mac)
- Mounts DMG and opens Finder for drag-to-Applications
- Cleans up stale mounts on startup
- Unsigned (`identity: null`) to avoid Gatekeeper issues with auto-updates

### Linux

- AppImage format for portability
- No root required for installation or updates
- Standard electron-updater flow
