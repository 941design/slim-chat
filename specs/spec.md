# Desktop App Bootstrap Specification

## 1. Purpose & Scope

### 1.1 Purpose

Provide a **production-ready bootstrap** for a cross-platform desktop application with:

* A **robust self-update pipeline** from day one
* A stable **UI layout shell** to host future features
* A **secure, open-source style** update verification model (no Apple ID / notarization)
* A **dev mode testing system** for validating updates before release

The **first release** has **minimal user-facing functionality** beyond:

* A **visible auto-update flow** integrated into the footer
* Local logging and configuration

All additional features will be delivered through subsequent self-updates.

### 1.2 Scope

In scope:

* Electron desktop app (TypeScript) with:
  * **macOS** support (unsigned bundle; Gatekeeper bypass required once)
  * **Linux** support via **AppImage**
* Self-updater using:
  * **GitHub Releases** as the update backend
  * **RSA-4096 signed manifest verification** before applying updates
* UI shell with header, footer, sidebar, and main content area
* Update controls in footer with:
  * Version and status display
  * Automatic update checks at configurable intervals
  * Download progress with real-time metrics
  * Manual refresh control
* Configuration via local JSON file
* Local-only logging (no external telemetry)
* Dev mode testing with configurable update sources
* CI/CD pipeline for automated releases

### 1.3 Explicit Non-goals

* No **Windows** support in initial release
* No **Apple ID** or macOS notarization
* No **remote telemetry or analytics**
* No **multi-language UI** (English only)

### 1.4 Target Users

* Developers and power users comfortable with:
  * Downloading desktop apps from GitHub
  * Bypassing macOS Gatekeeper warnings for unsigned apps
* Eventually, end users who receive new features via self-updates

---

## 2. Architecture Overview

### 2.1 Tech Stack

* **Main process**: Electron with TypeScript
* **Renderer**: React with TypeScript
* **Cryptography**: RSA-4096 signatures, SHA-256 hashes
* **Packaging**: electron-builder with GitHub Releases

### 2.2 Supported Platforms

* **macOS**: Minimum macOS 12+, unsigned binary
* **Linux**: AppImage for modern distributions

### 2.3 Process Model

The application follows Electron's three-process architecture:

* **Main process**: Controls application lifecycle, owns auto-update logic and cryptographic verification, handles IPC requests
* **Preload script**: Security bridge with `contextIsolation: true` and `nodeIntegration: false`, exposes typed IPC facade via `contextBridge`
* **Renderer process**: React application, sandboxed environment, communicates via preload API only

---

## 3. Core Functionality

### 3.1 Self-Update Flow

**Update backend**: GitHub Releases with semantic version tags (`MAJOR.MINOR.PATCH`, no 'v' prefix).

**On application start**:
1. Load configuration
2. Initialize logging
3. Create window and load UI
4. Begin background update check (if enabled)

**Update phases**:

| Phase | Description |
|-------|-------------|
| `idle` | No update activity |
| `checking` | Checking for available updates |
| `available` | Update found, awaiting user action |
| `downloading` | Download in progress |
| `downloaded` | Download complete |
| `verifying` | Cryptographic verification in progress |
| `ready` | Verified and ready to install |
| `failed` | Error occurred |

Platform-specific phases for macOS DMG installation:
| Phase | Description |
|-------|-------------|
| `mounting` | DMG being mounted |
| `mounted` | Finder window open for drag-and-drop |

### 3.2 Footer Update Controls

The footer serves as the central hub for update information and controls:

**Status display formats**:
* Up-to-date: `v{version} • Up to date`
* Checking: `v{version} • Checking for updates...`
* Available: `v{version} • Update available: v{new-version}`
* Downloading: `v{version} • Downloading: {percent}% ({transferred}/{total}) @ {speed}`
* Ready: `v{version} • Update ready: v{new-version}`
* Failed: `v{version} • Update failed: {message}`

**Controls**:
* Manual refresh icon (always visible, disabled during active operations)
* "Download Update" button (when update available)
* "Restart to Update" button (when ready to install)

**Automatic checks**:
* On startup (once window ready)
* At configurable intervals: 1h, 2h, 4h, 12h, 24h, or never
* Default: 1 hour

### 3.3 Configuration

Schema:

```typescript
interface AppConfig {
  autoUpdate: boolean;                    // Enable update checks
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  autoUpdateBehavior?: 'manual' | 'auto-download';
  autoCheckInterval?: '1h' | '2h' | '4h' | '12h' | '24h' | 'never';
}
```

Defaults: `{ autoUpdate: true, logLevel: 'info', autoCheckInterval: '1h' }`

### 3.4 Logging

* Writes to log file in user data directory
* JSON Lines format with `level`, `message`, `timestamp`
* Level filtering based on configuration
* Local storage only, no external transmission

---

## 4. Update Security Model

### 4.1 Cryptographic Verification

Each release includes a signed manifest with:

```json
{
  "version": "1.2.3",
  "createdAt": "2025-01-01T12:00:00Z",
  "artifacts": [
    {
      "platform": "darwin",
      "type": "dmg",
      "url": "Nostling-1.2.3.dmg",
      "sha256": "<hex-encoded-sha256>"
    }
  ],
  "signature": "<base64-rsa-signature>"
}
```

**Signing**: RSA-4096 private key signs canonical JSON of `{version, artifacts, createdAt}` using SHA-256.

**Verification flow**:
1. Download artifact via electron-updater
2. Fetch manifest from release
3. Verify RSA signature on manifest
4. Validate version is newer than current
5. Find artifact for current platform
6. Compute SHA-256 hash of downloaded file
7. Compare hash with manifest
8. Apply update only if all checks pass

### 4.2 Platform Security

* **macOS**: No notarization; RSA + HTTPS for update integrity
* **Linux**: RSA + HTTPS model
* **Production**: HTTPS-only, pre-releases blocked, custom sources ignored
* **Dev mode**: Allows file:// URLs and custom sources for testing

### 4.3 Error Handling

* Production: Generic error messages (no HTTP codes, JSON errors, or field names exposed)
* Dev mode: Full error details for debugging

---

## 5. Dev Mode Testing

### 5.1 Purpose

Enable testing the complete update flow before releasing:
* Verify update checking works
* Validate cryptographic verification
* Test UI state transitions
* Ensure error handling works correctly

### 5.2 Configuration

Dev mode activates when running the development server.

Environment variables:
* `DEV_UPDATE_SOURCE`: Custom update source (GitHub URL or file:// path)
* `ALLOW_PRERELEASE`: Enable pre-release versions
* `FORCE_DEV_UPDATE_CONFIG`: Force dev mode in unpacked app

### 5.3 Production Safety

Dev mode features are **automatically disabled** in production builds:
* Custom update sources ignored
* Pre-release versions blocked
* file:// URLs rejected
* Only official GitHub releases via HTTPS accepted

---

## 6. Non-Functional Requirements

### 6.1 Performance

* Main window visible within 2 seconds on typical hardware
* Update status appears within 5 seconds of startup (network permitting)
* Background checks do not block UI

### 6.2 Reliability

* App functions normally when GitHub is unreachable
* Never applies partially downloaded or unverified updates
* Continues using current version when update fails
* Incomplete updates discarded on restart

### 6.3 Security

* Renderer: `nodeIntegration: false`, `contextIsolation: true`
* IPC: Typed channels with domain prefixes, no generic eval
* Content: Only local renderer code loaded
* Updates: HTTPS + RSA-4096 + SHA-256 verification

### 6.4 Privacy

* No external telemetry
* No user data sent to servers (except standard GitHub update requests)
* Logs stored locally only

---

## 7. Persistence Layer

### 7.1 Purpose

Provide local data persistence for application state, preferences, and feature-specific data using SQLite with automatic schema migrations.

### 7.2 Architecture

* **Database**: SQLite via sql.js WebAssembly implementation
* **Location**: `{userData}/nostling.db`
* **Migrations**: Knex.js-compatible migration system
* **Schema versioning**: Automatic migration execution on startup

### 7.3 Migration System

**Migration format**:
```typescript
interface Migration {
  up(knex: Knex): Promise<void>;    // Apply migration
  down(knex: Knex): Promise<void>;  // Rollback migration
}
```

**Properties**:
* Migrations run automatically on application startup
* Migrations are idempotent (safe to run multiple times)
* Each migration runs in a transaction for atomicity
* Migration failures prevent application startup
* Migrations tracked in `knex_migrations` table
* Migrations run sequentially in filename order

**Limitations**:
* sql.js does not support WAL mode; migrations use default rollback journal
* Each migration must be self-contained and independent
* No concurrent migration execution (single-process protection)

### 7.4 State Storage

Key-value store for application preferences and settings:

```typescript
interface StateStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
}
```

**Properties**:
* Values stored as JSON-serialized strings
* Automatic JSON serialization/deserialization
* Key uniqueness enforced by schema
* Upsert semantics for `set` operation

**Schema**:
```sql
CREATE TABLE app_state (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 8. IPC Interface

### 8.1 API Structure

Nested structure:
```typescript
interface RendererApi {
  updates: {
    checkNow(): Promise<void>;
    downloadUpdate(): Promise<void>;
    restartToUpdate(): Promise<void>;
    onUpdateState(callback: (state: UpdateState) => void): () => void;
  };
  config: {
    get(): Promise<AppConfig>;
    set(config: Partial<AppConfig>): Promise<AppConfig>;
  };
  system: {
    getStatus(): Promise<AppStatus>;
  };
}
```

### 8.2 Data Types

```typescript
type UpdatePhase =
  | 'idle' | 'checking' | 'available' | 'downloading'
  | 'downloaded' | 'verifying' | 'ready' | 'failed'
  | 'mounting' | 'mounted';  // macOS-specific

interface UpdateState {
  phase: UpdatePhase;
  detail?: string;
  version?: string;
  progress?: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  };
}

interface AppStatus {
  version: string;
  platform: string;
  lastUpdateCheck?: string;
  updateState: UpdateState;
  logs: LogEntry[];
}
```

### 8.3 Persistence API

```typescript
interface RendererApi {
  state: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    getAll(): Promise<Record<string, unknown>>;
  };
}
```

---

## 9. State Machine

### 9.1 Update State Transitions

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌──────┐  check   ┌──────────┐  not-available  ┌──────┐ │
│ idle │─────────▶│ checking │────────────────▶│ idle │◀┘
└──────┘          └──────────┘                 └──────┘
    ▲                   │
    │                   │ update-available
    │                   ▼
    │             ┌───────────┐  download
    │             │ available │─────────────┐
    │             └───────────┘             │
    │                                       ▼
    │                              ┌─────────────┐
    │                              │ downloading │
    │                              └─────────────┘
    │                                       │
    │                                       │ download-complete
    │                                       ▼
    │                              ┌────────────┐
    │                              │ downloaded │
    │                              └────────────┘
    │                                       │
    │                                       │ auto
    │                                       ▼
    │                              ┌───────────┐
    │                              │ verifying │
    │                              └───────────┘
    │                                   │
    │               ┌───────────────────┴───────────────────┐
    │               │ verify-success                         │ verify-failed
    │               ▼                                        ▼
    │          ┌─────────┐                             ┌────────┐
    │          │  ready  │                             │ failed │
    │          └─────────┘                             └────────┘
    │               │                                        │
    │               │ restart                                │ retry
    │               ▼                                        │
    │       [App restarts]                                   │
    │                                                        │
    └────────────────────────────────────────────────────────┘

Error from any state → failed
```

### 9.2 Properties

* **Deterministic**: Same event from same state always produces same next state
* **Broadcast Consistency**: Every state change notifies renderer
* **Version Tracking**: Version info preserved through download/verify/ready phases
* **Error Recovery**: All errors result in `failed` state with retry option
* **Concurrency Guard**: Prevents overlapping update operations

---

## 10. Build & Release

### 10.1 Packaging

* macOS: `.dmg` (installer) and `.zip` (for updates)
* Linux: `.AppImage` (portable, no root required)

### 10.2 Release Process

* Tags in format `MAJOR.MINOR.PATCH` (no 'v' prefix)
* `package.json` version must match tag exactly
* CI builds packages, signs manifest, creates GitHub Release
* Release includes: platform artifacts, signed manifest, electron-updater metadata

---

## 11. Acceptance Criteria

### 11.1 Installation & Startup

* App installs and starts on macOS 12+ and supported Linux distributions
* Layout visible: header, footer, sidebar, main area
* Footer displays version and update status

### 11.2 Update Behavior

* New release triggers: `idle → checking → available → downloading → downloaded → verifying → ready`
* Footer reflects states with appropriate labels and progress
* "Restart to Update" button appears when ready
* Update failures logged at error level, retry available, app remains usable

### 11.3 Security

* Renderer has no direct Node access
* All operations via IPC
* Update blocked if: signature fails, hash fails, or version not newer

### 11.4 Dev Mode

* Custom update sources work in dev mode
* Pre-release testing available
* Dev features disabled in production builds

### 11.5 Persistence

* Database created automatically on first startup
* Migrations execute successfully on application startup
* State operations (get/set/delete/getAll) work correctly
* Data persists across application restarts
* Migration failures prevent application startup with clear error messages
