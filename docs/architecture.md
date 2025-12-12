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

**Key features:**
- Themed status messages using JSON-based configuration with runtime validation
- Memoized message selection for performance optimization

## Directory Structure

```
src/
├── main/           # Main process (Node.js)
│   ├── index.ts    # Entry point
│   ├── config.ts   # Configuration
│   ├── logging.ts  # Logging system
│   ├── ipc/        # IPC handlers
│   ├── security/   # Crypto verification
│   ├── relay/      # Relay configuration management
│   └── update/     # Update management
├── preload/        # Preload script
│   └── index.ts    # API bridge
├── renderer/       # React frontend
│   ├── main.tsx    # React root
│   ├── index.html  # HTML entry
│   ├── components/ # UI components
│   │   └── RelayManager.tsx  # Relay configuration UI
│   └── utils/      # Utilities
│       ├── themed-messages.ts    # Theme configuration
│       ├── utils.themed.ts       # Update status theming
│       └── state.themed.ts       # Nostling queue theming
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
| `relay:load` | Load relay configuration for identity |
| `relay:save` | Save relay configuration with hash verification |
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

## Relay Configuration System

The relay manager provides per-identity relay configuration with filesystem-based persistence and conflict detection.

### Architecture

**Filesystem-Based Storage:**
- Configuration stored at `~/.config/nostling/identities/<identityId>/relays.json`
- One file per identity, isolated from database
- Human-readable JSON format for manual editing
- Automatic directory creation on first save

**File Format:**
```json
{
  "relays": [
    {
      "url": "wss://relay.example.com",
      "read": true,
      "write": true
    }
  ]
}
```

**Hash-Based Overwrite Protection:**
- SHA-256 hash computed on load and before save
- Detects external modifications to relay configuration files
- On conflict: presents modal with Reload/Overwrite/Cancel options
- Prevents accidental loss of manual edits

**Migration from Database:**
- One-time idempotent migration from SQLite `relays` table
- Runs automatically on first relay:load for each identity
- Creates filesystem config from database records
- Database records remain unchanged (safe rollback)

### UI Components

**Compact Table Layout:**
- High-density rows (≤36px) using @tanstack/react-table
- Columns: Status indicator, URL, Read checkbox, Write checkbox, Actions
- Drag handle for reordering
- Delete button per row

**Drag-and-Drop Reordering:**
- Implemented with dnd-kit library
- Visual feedback during drag operations
- Preserves read/write policies during reorder
- Updates configuration order immediately

**Read/Write Policies:**
- Read checkbox: controls relay subscription (receiving events)
- Write checkbox: controls relay publishing (sending events)
- Independent controls per relay
- Persisted in relays.json

**Live Status Indicators:**
- Green dot: connected
- Yellow dot: connecting/reconnecting
- Red dot: disconnected/error
- Based on WebSocket connection state

### Conflict Resolution

When external modifications detected:

1. **Reload**: Discard UI changes, load file from disk
2. **Overwrite**: Save UI state, replace file contents
3. **Cancel**: Keep UI state, remain in conflict state

User must explicitly resolve conflict before saving again.

## Themed Messages System

The application uses ostrich-themed status messages throughout the UI to provide a playful, branded experience while maintaining technical clarity.

### Architecture

**Three-layer system:**

1. **Configuration Layer** (`themed-messages.ts`):
   - JSON-based theme definition with 2-3 alternatives per status type
   - Runtime validation with schema checking
   - Graceful fallback to default messages on validation failure
   - Single source of truth for all themed messages

2. **Update Status Theming** (`utils.themed.ts`):
   - Themes update-related status messages (checking, downloading, up to date, etc.)
   - Preserves dynamic content (version numbers, progress percentages, download speeds)
   - Random selection from configured alternatives on each display
   - Memoized with React.useMemo for performance

3. **Nostling Queue Theming** (`state.themed.ts`):
   - Themes Nostling message queue status (queued, sending, receiving, etc.)
   - Preserves dynamic content (message counts, error details)
   - Consistent random selection behavior
   - Integrated with queue state display components

### Message Categories

**Update Status Messages:**
- Idle states: "Standing tall", "Tall and proud", "Head held high"
- Active states: "Eyes peeled", "Pecking up", "Looking sharp"
- Error states: "Ruffled feathers", "Tangled nest"

**Nostling Queue Status:**
- Queue states: "Flock gathered", "Nestling in"
- Active states: "Wings spread", "Feathers flying"
- Completion states: "Nest secured", "Roost reached"

### Design Principles

- **Preserve technical information**: All version numbers, counts, and error details remain intact
- **Random variety**: Each display randomly selects from available alternatives to keep experience fresh
- **Graceful degradation**: Invalid configuration falls back to default messages without breaking UI
- **Performance**: Message selection memoized to avoid unnecessary recalculation
- **Testability**: Property-based tests verify message structure, dynamic content preservation, and randomness
