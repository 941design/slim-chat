# Desktop App Bootstrap Specification

## 1. Purpose & Scope

### 1.1 Purpose

Provide a **production-ready bootstrap** for a cross-platform desktop application with:

* A **robust self-update pipeline** from day one.
* A stable **UI layout shell** to host future features.
* A **secure, open-source style** update verification model (no Apple ID / notarization).
* A **dev mode testing system** for validating updates before release.

The **first release** will have **minimal user-facing functionality** beyond:

* A **status dashboard**.
* A **visible auto-update flow** integrated into the layout.
* Local logging and configuration.

All additional features (SQLite, icons, top bar symbol, new functionality, richer UI) will be delivered through subsequent self-updates.

### 1.2 Scope (Initial Release)

In scope for the first production-ready release:

* Electron desktop app (TypeScript) with:

  * **macOS** support (unsigned / self-signed bundle; Gatekeeper bypass required once).
  * **Linux** support, primary packaging: **AppImage**.
* Self-updater using:

  * **GitHub Releases** as the update backend.
  * **electron-updater** (generic provider with custom feed URL).
  * **RSA-4096 signed manifest verification** before applying updates.
* UI shell:

  * **Header**
  * **Footer**
  * **Left sidebar**
  * **Right main content area**
  * **Update indicator/control at the bottom of the sidebar**.
* Status dashboard in the main area:

  * Current version.
  * Platform info.
  * Last update check time.
  * Recent update-related log snippets.
* Configuration:

  * Local **JSON config file** in user config directory.
* Logging:

  * **Local logs only**, no external telemetry.
* Dev mode testing:

  * Test auto-updates locally before releasing to users.
  * Configure update sources via environment variables.
  * Production safety enforced in packaged builds.
* CI/CD pipeline:

  * Automatic builds and GitHub Releases from tags (macOS + Linux AppImage).
  * Creation and signing of the release manifest (RSA-4096).

### 1.3 Explicit Non-goals (Initial Release)

* No **Windows** support.
* No **Apple ID** or macOS notarization.
* No **SQLite** or DB migrations yet (architecture prepared, but not implemented).
* No **remote telemetry or analytics**.
* No **multi-language UI** (English only).
* No **advanced features beyond update/status/logging** shell.

### 1.4 Target Users

* Developers and power users comfortable with:

  * Downloading desktop apps from GitHub.
  * Bypassing macOS Gatekeeper warnings for unsigned apps.
* Eventually, end users who receive new features via self-updates.

### 1.5 Target Release Type

* **Production-ready process**, minimal functionality.
* The **update pipeline, security model, and CI** must be production-grade from the first release.

---

## 2. Architecture Overview

### 2.1 Tech Stack

* **Main process**

  * Electron 30+.
  * TypeScript.
* **Renderer**

  * React 18 + TypeScript.
  * Vite bundler.
* **Cryptography**

  * RSA-4096 signatures with SHA-256 hash algorithm.
  * SHA-256 file hashes for artifact verification.
* **Packaging & Updates**

  * electron-builder.
  * electron-updater (generic provider, custom feed URL).
  * GitHub Releases as artifact host.

### 2.2 Supported Platforms

* **macOS**

  * Minimum version: **macOS 12+**.
  * Unsigned / self-signed binary; users must bypass Gatekeeper on first install.
  * Subsequent updates performed by app's own updater.
* **Linux**

  * Target: modern distributions supporting **AppImage**.
  * Install location: per-user, writable (no root required) to allow self-updates.

### 2.3 Process Model

* **Main process**

  * Controls BrowserWindows.
  * Owns auto-update logic and RSA-4096 verification.
  * Handles IPC requests for updates, configuration, logs, and system info.
* **Preload script**

  * `contextIsolation: true`, `nodeIntegration: false`.
  * Exposes a **strict, typed IPC facade** via `contextBridge` (`window.api`).
* **Renderer process**

  * React app rendering layout (header/footer/sidebar/main).
  * Consumes `window.api.*` methods; no direct Node access.

### 2.4 Directory Structure

```text
/src
  /main
    /update          # controller.ts, manifest-generator.ts
    /security        # verify.ts, crypto.ts, version.ts
    /ipc             # handlers.ts
    index.ts         # app bootstrap, window creation, state machine
    integration.ts   # manifest fetching, verification orchestration
    dev-env.ts       # dev mode detection and configuration
    config.ts        # config loading/saving (JSON)
    logging.ts       # log file management
  /renderer
    main.tsx         # React application entry
    styles.css       # Application styles
    index.html       # HTML template
    types.d.ts       # Window API type declarations
  /preload
    index.ts         # IPC bridge, contextBridge exposure
  /shared
    types.ts         # shared types (between main & renderer)
/scripts             # build, release, manifest signing scripts
/release             # built artifacts & manifest.json
/tests               # unit and integration tests
package.json
tsconfig.json
electron-builder.yml (embedded in package.json)
vite.renderer.config.ts
```

---

## 3. Core Functionality

### 3.1 Self-Update Flow (High-level)

**Update backend:**

* GitHub Releases, with semantic version tags: `vMAJOR.MINOR.PATCH` (e.g., `v1.2.3`).
* `package.json` version: `MAJOR.MINOR.PATCH` (must match tag number).
* Build artifacts for each release:

  * macOS: `.dmg` and `.zip`.
  * Linux: `.AppImage`.
* A signed **manifest JSON** (see §4) stored in the same GitHub Release.

**On application start:**

1. Load configuration (JSON).
2. Initialize logging.
3. Create BrowserWindow and load React UI.
4. Kick off **background update check** (if enabled in config):

   * Use `electron-updater`'s `autoUpdater.checkForUpdates()`.
   * Listen for events and propagate status via IPC to renderer.

**Update UX (UI model: explicit states):**

* The app remains usable during update checking/download.
* Update control is presented **at the bottom of the left sidebar**.

Timeline:

1. **Idle state**:

   * Sidebar shows e.g. "Up to date" or "No updates checked yet".
   * "Check for updates" button available.

2. **Checking state**:

   * Sidebar shows "Checking..." button text.

3. **Update available**:

   * Sidebar indicates "Update available" with version.
   * User can initiate download with "Download update" button.

4. **Downloading**:

   * Sidebar shows "Downloading..." button text.
   * Update progress remains visible; app content is usable.

5. **Downloaded**:

   * Brief transition state before verification begins.

6. **Verifying**:

   * The main process verifies the RSA-signed manifest.
   * Verifies the downloaded artifact's hash matches the manifest.
   * Sidebar shows "Verifying..." button text.

7. **Ready**:

   * If verification succeeds:
     * Sidebar shows "Restart to apply" button.
   * Button: "Restart to update" / "Restart now".

8. **Failed**:

   * If verification fails or any error occurs:
     * Sidebar shows error state, provides "Retry" button.
     * Error logged with detailed message.

9. **Restart to install**:

   * On user click:
     * Main process calls `autoUpdater.quitAndInstall()`.
     * App quits and relaunches into the **new version**.
   * On next startup:
     * (Future) DB migrations run if present.
     * Configuration and log locations remain stable.

### 3.2 electron-updater Integration

* Dependency: `electron-updater` in main process.

* Usage:

  * Configure `autoUpdater` with **generic provider** using `setFeedURL()`.
  * Manual control model:

    * `autoUpdater.checkForUpdates()`.
    * Handle `checking-for-update`, `update-available`, `download-progress`, `update-downloaded`, `error`, `update-not-available`.
    * Use `autoUpdater.downloadUpdate()` after user chooses to download (when `autoUpdateBehavior` is `manual`).
    * Call `autoUpdater.quitAndInstall()` when user initiates restart **after manifest verification**.

* `autoUpdater` event handlers:

  * Forward status to renderer via IPC:

    * Channel: `update-state` with payload:

      * `phase`: `idle | checking | available | downloading | downloaded | verifying | ready | failed`
      * `version?`: available/downloading version
      * `detail?`: error message or additional info
      * `progress?`: download progress object

### 3.3 UI Layout & Behavior

* **Header**

  * App title: "SlimChat Bootstrap".
  * Subtitle: "Secure auto-update shell".

* **Footer**

  * Version text: `vX.Y.Z` (current version, from IPC).
  * Security indicator: "RSA manifest verification enabled".

* **Sidebar (left)**

  * Upper portion:
    * Status section showing current update phase.
    * Detail text (version or error message).

  * Lower portion:
    * **Primary action button** (context-dependent):
      * "Check for updates" (idle)
      * "Checking..." (checking, disabled)
      * "Download update" (available)
      * "Downloading..." (downloading, disabled)
      * "Verifying..." (verifying, disabled)
      * "Restart to apply" (ready)
      * "Retry" (failed)
    * Secondary "Restart now" button when ready.

  * Footer:
    * "Updates served via GitHub Releases"
    * "Manifest signature required"

* **Main area (right) — Status Dashboard**

  * Cards/sections:

    * **Version**: Current app version.
    * **Platform**: OS platform identifier.
    * **Last update check**: Timestamp or "Not yet checked".
    * **Recent Logs**: Tail of log with update-related entries.

### 3.4 Logging

* Logging subsystem in `/src/main/logging.ts`:

  * Writes to a single log file in user data directory:
    * Location: `app.getPath('userData')/logs/app.log`
  * Log levels: `debug`, `info`, `warn`, `error`.
  * Level filtering based on configuration.
  * Maximum 200 lines returned for dashboard display.

* Log entries include:

  * App lifecycle events (start, stop).
  * Update events (check, available, download progress, download complete, verification success/failure, install start).
  * Significant errors (IPC errors, config load/save failures).

* Renderer access:

  * IPC method to fetch recent log lines via `system:get-status`.
  * No direct file access from renderer.

### 3.5 Configuration

* Config file:

  * Location: `app.getPath('userData')/config.json`
  * Schema:

    ```typescript
    interface AppConfig {
      autoUpdate: boolean;               // whether to check for updates
      logLevel: LogLevel;                // "debug" | "info" | "warn" | "error"
      manifestUrl?: string;              // custom manifest URL override
      autoUpdateBehavior?: 'manual' | 'auto-download';  // download behavior
      logRetentionDays?: number;         // future: log retention
      logMaxFileSizeMB?: number;         // future: log size limit
      forceDevUpdateConfig?: boolean;    // dev mode: force update checks
      devUpdateSource?: string;          // dev mode: custom update source
      allowPrerelease?: boolean;         // dev mode: allow pre-release versions
    }
    ```

* Behavior:

  * On startup: load config; if file missing, use defaults and create file.
  * Default values: `{ autoUpdate: true, logLevel: 'info' }`.
  * Config normalization validates all field types.
  * On update: config schema may be extended; maintains backward compatibility.
  * IPC methods: `config:get`, `config:set` (used by future settings UI).

---

## 4. Update Security Model

### 4.1 RSA-4096 Signing

* A **release manifest JSON** is generated for each GitHub Release by CI.

Example `manifest.json`:

```json
{
  "version": "1.2.3",
  "createdAt": "2025-01-01T12:00:00Z",
  "artifacts": [
    {
      "platform": "darwin",
      "type": "dmg",
      "url": "https://github.com/941design/slim-chat/releases/download/v1.2.3/SlimChat-1.2.3.dmg",
      "sha256": "<hex-encoded-sha256>"
    },
    {
      "platform": "linux",
      "type": "AppImage",
      "url": "https://github.com/941design/slim-chat/releases/download/v1.2.3/SlimChat-1.2.3-x64.AppImage",
      "sha256": "<hex-encoded-sha256>"
    }
  ],
  "signature": "<base64-rsa-signature-over-manifest-without-signature-field>"
}
```

* CI steps:

  1. Build artifacts for macOS and Linux.
  2. Compute SHA-256 for each artifact.
  3. Create `manifest.json` (without `signature`).
  4. Sign the canonicalized manifest JSON payload (version, artifacts, createdAt) with RSA-4096 private key using SHA-256.
  5. Insert `signature` field (base64-encoded).
  6. Upload `manifest.json` to the GitHub Release alongside artifacts.

* Private key handling:

  * Stored securely in GitHub Actions secrets as `SLIM_CHAT_RSA_PRIVATE_KEY`.
  * Never checked into repository.
  * Must be in PKCS8 PEM format.
  * Used in manifest generation script via environment variable.

* App-side:

  * RSA public key embedded in `/src/main/index.ts` or via `RSA_PUBLIC_KEY` environment variable.
  * Public key must be in SPKI PEM format.
  * `security/verify.ts`:

    * `verifySignature(manifest, publicKeyPem)`: Validates RSA signature using SHA-256.
    * `validateVersion(manifestVersion, currentVersion)`: Ensures manifest version > current version.
    * `findArtifactForPlatform(artifacts, platform)`: Finds matching artifact.
    * `verifyManifest(manifest, filePath, currentVersion, platform, publicKeyPem)`: Full verification flow.

  * `security/crypto.ts`:

    * `hashFile(filePath)`: Computes SHA-256 hash of downloaded file.
    * `hashMatches(hash1, hash2)`: Case-insensitive hash comparison.

### 4.2 Verification Flow

1. `autoUpdater` identifies a new version and downloads the artifact.
2. Main process:

   * Sets state to `downloaded`, then `verifying`.
   * Fetches `manifest.json` from configured URL.
   * Calls `verifyManifest`:
     1. Verify RSA signature on manifest.
     2. Validate version is newer than current.
     3. Find artifact entry matching current platform.
     4. Compute SHA-256 hash of downloaded file.
     5. Compare hash with manifest entry.
3. If all verification succeeds:

   * App updates state to `ready`.
   * Allows `quitAndInstall`.
4. If verification fails:

   * App logs detailed error.
   * Sets state to `failed` with error detail.
   * Does **not** apply the update.
   * Sidebar shows error state; user can retry.

### 4.3 macOS & Linux Security Constraints

* macOS:

  * No Apple notarization; system-level trust is limited to user accepting the app once.
  * After first install, updates are enforced by:

    * RSA-4096 signatures for integrity & authenticity.
    * GitHub HTTPS delivery.

* Linux:

  * Similar RSA + HTTPS model.
  * No distribution packaging trust (e.g., no .deb with distro keys) by default.

---

## 5. Dev Mode Update Testing

### 5.1 Purpose

Enable developers to test the complete update flow in development mode (`npm run dev`) before releasing to users. This provides confidence that:

* Update checking works correctly.
* Cryptographic verification functions properly.
* UI properly handles various update states.
* State transitions occur as expected.

### 5.2 Environment Variables

Dev mode is automatically detected when `VITE_DEV_SERVER_URL` is set (done by `npm run dev`).

Configuration environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_DEV_SERVER_URL` | Dev mode indicator (set by npm run dev) | unset |
| `DEV_UPDATE_SOURCE` | Custom update source URL | GitHub releases |
| `ALLOW_PRERELEASE` | Allow pre-release versions ("true"/"false") | false |
| `FORCE_DEV_UPDATE_CONFIG` | Force update checks in unpacked app | auto |

### 5.3 Dev Mode Configuration

The `dev-env.ts` module provides:

```typescript
interface DevUpdateConfig {
  forceDevUpdateConfig: boolean;
  devUpdateSource?: string;
  allowPrerelease: boolean;
}

function isDevMode(): boolean;           // Returns true if VITE_DEV_SERVER_URL is set
function getDevUpdateConfig(): DevUpdateConfig;  // Parse environment variables
```

Configuration precedence: Environment variables > Config file > Defaults

### 5.4 Production Safety (Critical Constraint)

**Production builds MUST NOT accept dev mode features:**

* When `isDevMode()` returns false:
  * `forceDevUpdateConfig` always false.
  * `allowPrerelease` always false.
  * `devUpdateSource` always undefined.

This is enforced in `getDevUpdateConfig()` which returns safe defaults for production.

### 5.5 Testing Workflow

```bash
# Basic dev mode (auto-enabled)
npm run dev

# Test against specific GitHub release
DEV_UPDATE_SOURCE=https://github.com/941design/slim-chat/releases/download/v1.0.1 npm run dev

# Test pre-release versions
ALLOW_PRERELEASE=true npm run dev
```

### 5.6 Graceful Error Handling

The update system handles unavailable sources without crashing:

* Network errors (404, timeout, DNS failure) → `failed` state with error detail.
* Invalid manifests (malformed JSON, missing fields) → Clear error messages.
* Version comparison failures → Reported as errors.
* Signature verification failures → Detailed diagnostic info.
* **Timeout protection**: Manifest fetch times out after 30 seconds (configurable).
* **Concurrency protection**: Prevents race conditions from overlapping update checks.

### 5.7 Diagnostic Logging

In dev mode, detailed logs are written for:

* Manifest URL being fetched.
* Version comparisons (current vs available).
* Signature verification steps.
* HTTP response codes and network errors.
* Update source configuration.

---

## 6. Non-Functional Requirements

### 6.1 Performance

* Startup time:

  * App main window should be visible within **2 seconds** on typical hardware.
* Update check:

  * Background check should not block UI.
  * Update status should appear in sidebar within **5 seconds** of startup (network permitting).

### 6.2 Reliability

* The app must:

  * Start and function normally when:

    * GitHub is unreachable.
    * Manifest or artifact downloads fail.
  * Never apply a partially downloaded or unverified update.
  * Continue using the currently installed version when update fails.

* Crash safety:

  * If app crashes during download:

    * On next startup, any incomplete update is discarded and a new check is performed.

### 6.3 Security

* Renderer:

  * `nodeIntegration: false`.
  * `contextIsolation: true`.
  * Strict `preload` API: only whitelisted IPC calls.
* IPC:

  * No generic `eval` or dynamic code loading.
  * Typed channels with domain prefixes.
* Content:

  * Only load local renderer code (no remote URLs).
* Updates:

  * HTTPS + RSA-4096 + SHA-256 verification.

### 6.4 Privacy

* No external telemetry.
* No user data sent to any server (other than standard GitHub update HTTP requests).
* Logs stored locally only.

### 6.5 Accessibility (Baseline)

* Keyboard navigation for sidebar and main content (focus states, tab order).
* Reasonable color contrast for default theme.
* Text content readable; no tiny fonts.
* Future TODO: ARIA landmarks and screen-reader optimizations.

### 6.6 Internationalization

* Initial release: English-only text.
* All user-visible strings in renderer components (facilitate future i18n).

---

## 7. Data & Interfaces

### 7.1 Domain Data

Domain entities in `/src/shared/types.ts`:

* **LogLevel**

  * `'debug' | 'info' | 'warn' | 'error'`

* **AppConfig**

  * See §3.5 Configuration schema.

* **AppStatus**

  * `version: string`
  * `platform: NodeJS.Platform`
  * `lastUpdateCheck?: string`
  * `updateState: UpdateState`
  * `logs: LogEntry[]`

* **LogEntry**

  * `level: LogLevel`
  * `message: string`
  * `timestamp: string`

* **UpdatePhase**

  * `'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'verifying' | 'ready' | 'failed'`

* **DownloadProgress**

  * `percent: number`
  * `bytesPerSecond: number`
  * `transferred: number`
  * `total: number`

* **UpdateState**

  * `phase: UpdatePhase`
  * `detail?: string`
  * `version?: string`
  * `progress?: DownloadProgress`

* **ManifestArtifact**

  * `url: string`
  * `sha256: string`
  * `platform: 'darwin' | 'linux' | 'win32'`
  * `type: 'dmg' | 'zip' | 'AppImage' | 'exe'`

* **SignedManifest**

  * `version: string`
  * `artifacts: ManifestArtifact[]`
  * `createdAt: string`
  * `signature: string`

### 7.2 IPC Surface (Preload API)

Exposed via `contextBridge` as `window.api`:

**Nested API structure (current):**

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

**Legacy flat API (backward compatibility):**

```typescript
interface LegacyRendererApi {
  getStatus(): Promise<AppStatus>;
  checkForUpdates(): Promise<void>;
  restartToUpdate(): Promise<void>;
  onUpdateState(callback: (state: UpdateState) => void): () => void;
  getConfig(): Promise<AppConfig>;
  setConfig(config: Partial<AppConfig>): Promise<AppConfig>;
}
```

**IPC Channels:**

| Channel | Handler | Description |
|---------|---------|-------------|
| `system:get-status` | getStatus() | Get app status, logs, update state |
| `updates:check` | checkForUpdates() | Trigger update check |
| `updates:download` | downloadUpdate() | Start update download |
| `updates:restart` | restartToUpdate() | Restart to apply update |
| `config:get` | getConfig() | Get current configuration |
| `config:set` | setConfig(partial) | Update configuration |
| `status:get` | getStatus() | Legacy alias |
| `update:check` | checkForUpdates() | Legacy alias |
| `update:restart` | restartToUpdate() | Legacy alias |

**Broadcast channel:**

* `update-state`: Sent from main to renderer when update state changes.

### 7.3 Future SQLite Integration (Design Hooks)

Not implemented in initial release, but design must anticipate:

* A dedicated `/src/main/db` module.
* DB file located in user data directory.
* Schema versioning and migrations:

  * Table for metadata (e.g., `schema_version`).
  * **Automatic migrations on startup**:

    * Run before UI is loaded.
    * If migration is fast, no extra UI shown.
    * If migration is potentially long or complex:

      * Show a minimal "Updating data..." screen (splash or blocking view) before main UI.

---

## 8. Build, Packaging & CI

### 8.1 electron-builder Configuration

Configuration embedded in `package.json`:

```json
{
  "build": {
    "appId": "com.example.slimchat",
    "productName": "SlimChat",
    "files": [
      "dist/main/**/*",
      "dist/preload/**/*",
      "dist/renderer/**/*",
      "package.json"
    ],
    "asar": true,
    "directories": {
      "buildResources": "build"
    },
    "mac": {
      "target": ["dmg", "zip"],
      "category": "public.app-category.developer-tools",
      "minimumSystemVersion": "12.0.0"
    },
    "linux": {
      "target": ["AppImage"],
      "category": "Utility",
      "artifactName": "${productName}-${version}-${arch}.${ext}"
    }
  }
}
```

### 8.2 GitHub Repository & Releases

* Repo:

  * Hosted on GitHub: `941design/slim-chat`.
* Versioning:

  * Tags in format `MAJOR.MINOR.PATCH` (e.g., `1.0.0`).
  * `package.json` version: `MAJOR.MINOR.PATCH` to match tag.
* Releases:

  * Created automatically by CI on tag push.
  * Attach artifacts:

    * macOS `.dmg` and `.zip`.
    * Linux `.AppImage`.
    * `manifest.json` (signed).
    * `latest-mac.yml` / `latest-linux.yml` (electron-updater metadata).

### 8.3 GitHub Actions CI

**Workflow file:** `.github/workflows/release.yml`

Workflow triggers:

* On `push` of tags matching `[0-9]+.[0-9]+.[0-9]+`.

Jobs:

1. **build** (matrix: ubuntu-latest, macos-13)

   * Checkout repository.
   * Setup Node.js 20.
   * Install dependencies (`npm ci`).
   * Run linting (`npm run lint`).
   * Build packages (`npm run package -- --publish=never`).
   * Generate manifest (Linux only, uses `SLIM_CHAT_RSA_PRIVATE_KEY` secret).
   * Upload artifacts.

2. **create-release** (needs: build)

   * Download all build artifacts.
   * Create GitHub Release with:
     * `.dmg` files
     * `.AppImage` files
     * `.yml` metadata files
     * `manifest.json`

Security:

* RSA-4096 private key stored in GitHub Actions secret `SLIM_CHAT_RSA_PRIVATE_KEY`.
* CI uses environment variables to pass key to signing script.

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

### 9.2 State Machine Properties

**Event Handler Behavior:**

| Event | State Transition | Side Effects |
|-------|------------------|--------------|
| `checking-for-update` | → `checking` | Broadcast state, update lastUpdateCheck |
| `update-available` | → `available` | Broadcast state, log version |
| `download-progress` | → `downloading` | Broadcast state with progress |
| `update-not-available` | → `idle` | Broadcast state |
| `update-downloaded` | → `downloaded` → `verifying` → `ready`/`failed` | Fetch and verify manifest |
| `error` | → `failed` | Broadcast state, log error |

**Critical Properties:**

* **Deterministic**: Same event from same state always produces same next state.
* **Broadcast Consistency**: Every state change calls `broadcastUpdateStateToMain()`.
* **Version Tracking**: Version info preserved through downloading/verifying/ready phases.
* **Error Recovery**: All error events result in `failed` state with detail message.
* **Concurrency Guard**: Prevents overlapping update checks (`checking` → skip new check).

### 9.3 Test Coverage

Property-based tests in `/src/main/index.test.ts` verify:

* Each event handler updates `updateState` correctly.
* Each event handler calls `broadcastUpdateStateToMain()`.
* Error events transition to `failed` from any phase.
* Verification workflow follows correct sequence.
* Version information propagates correctly through states.

---

## 10. Constraints & Assumptions

* **No Windows** support in initial scope.
* **No Apple ID or notarization**; users must manually allow app on macOS.
* **No backend server** besides GitHub; all update and signing infrastructure is GitHub + CI.
* App requires:

  * Internet connectivity to check for and download updates.
  * File system permissions to write config, logs, and future DB.
* **Node.js 20.x** required for development.

---

## 11. Acceptance Criteria

### 11.1 Installation & Startup

* App installs and starts successfully on:

  * macOS 12+ (after user bypasses Gatekeeper once).
  * A supported Linux distribution using AppImage.

* On first launch:

  * Header, footer, sidebar, and main area are visible.
  * Sidebar shows an update status component at its bottom.
  * Main area shows status dashboard with:

    * Current version.
    * Platform information.
    * Last update check as "Not yet checked" or equivalent.

### 11.2 Update Behavior

* When a new release is published on GitHub:

  * An app with an older version, on startup, eventually transitions:

    * `idle → checking → available → downloading → downloaded → verifying → ready`.
  * Sidebar reflects these states with appropriate labels and progress.
  * After download and successful verification:

    * Sidebar shows "Restart to apply" with a button.
  * On clicking the button:

    * App restarts and runs the new version (version text updated in footer and status dashboard).

* When no new release is available:

  * App shows `idle → checking → idle` with "Up to date" message.

* Update failures (e.g., network issue, manifest signature invalid, hash mismatch):

  * Do not cause the app to crash.
  * Result in:

    * Log entry at `error` level.
    * Sidebar showing error state with "Retry" option.
    * App remains usable.

### 11.3 Security & IPC

* Renderer has no direct access to Node APIs:

  * `nodeIntegration` disabled.
  * `contextIsolation` enabled.
* All operations (update check, restart, config access, logs access, system info, version) are performed via `window.api.*` methods.
* Update is not applied if:

  * Manifest RSA signature verification fails.
  * Artifact SHA-256 hash verification fails.
  * Manifest version is not newer than current version.

### 11.4 Logging & Config

* A log file is created on first run in the user's data directory.
* Status dashboard can display recent log entries.
* Changing log level in config affects new log entries on next startup.
* Config file is created with default values if nonexistent, and loading it does not crash the app even if partially corrupted (fallback to defaults with logged warning).

### 11.5 UX & Layout

* Layout is consistent across platforms:

  * Header at top, footer at bottom, sidebar left, main content right.
* Sidebar update indicator is always visible and does not block user interaction with the main area.
* Keyboard navigation:

  * Tab order allows reaching sidebar controls and main content.
* Text and colors are readable under default OS conditions.

### 11.6 Dev Mode Testing

* When running `npm run dev`:

  * Update checks can execute (not skipped for "not packed" app).
  * Custom update sources can be configured via environment variables.
  * Pre-release versions can be tested with `ALLOW_PRERELEASE=true`.

* In production builds:

  * Dev mode features are automatically disabled.
  * Pre-release versions are never accepted.
  * Custom update sources are ignored.

---

## 12. Delivery & Milestones

### Milestone 1 — Core Shell & Local Build ✓

* Electron + React + TypeScript project scaffolded.
* Layout implemented (header, footer, sidebar, main).
* Preload and strict IPC facade in place.
* Status dashboard displays version and platform info.
* Local logging to file implemented.
* Local config (JSON) implemented with default values.

### Milestone 2 — Self-Update Integration ✓

* electron-builder configured for macOS + Linux AppImage.
* GitHub Releases integrated.
* `autoUpdater` wired in with event handling via generic provider.
* Sidebar update UI integrated with actual update state from main process.
* Update flow: Check → available → download → downloaded → verifying → ready → restart.

### Milestone 3 — RSA-4096 Security & CI ✓

* RSA-4096 public key embedded in app.
* RSA-4096 private key set up as CI secret.
* CI pipeline:

  * Builds artifacts.
  * Computes SHA-256 hashes.
  * Generates and signs `manifest.json`.
  * Publishes artifacts + manifest to GitHub Release.
* App verifies manifest and artifact before applying update.

### Milestone 4 — Dev Mode Testing ✓

* Dev mode detection via `VITE_DEV_SERVER_URL`.
* Environment variable configuration for update sources.
* Pre-release testing support.
* Production safety enforcement.
* Manifest fetch timeout (30 seconds).
* Concurrency protection for update checks.
* Comprehensive test coverage (292+ tests including property-based tests).

### Milestone 5 — Polish & Hardening

* Refine update UI states and error messages in sidebar.
* Improve log view in status dashboard.
* Ensure robust handling of:

  * No network.
  * GitHub 404/5xx.
  * Corrupted config file (recover gracefully).
* Document:

  * Installation instructions for macOS and Linux.
  * How to use tags/releases to trigger updates.
  * How the signing process works.

### Future Milestones (Out of Current Scope but Anticipated)

* Add SQLite DB and migration system:

  * DB module in `/src/main/db`.
  * Automatic migrations on startup with optional "Updating data..." screen.
* Add icons and top bar symbol.
* Introduce feature pages in main area (beyond status dashboard).
* Add settings UI for configuration:

  * Auto-update toggle.
  * Log level, etc.
* Optional telemetry (if ever desired) as explicit opt-in.

---
