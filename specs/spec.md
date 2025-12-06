# Desktop App Bootstrap Specification

## 1. Purpose & Scope

### 1.1 Purpose

Provide a **production-ready bootstrap** for a cross-platform desktop application with:

* A **robust self-update pipeline** from day one.
* A stable **UI layout shell** to host future features.
* A **secure, open-source style** update verification model (no Apple ID / notarization).

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
  * **electron-updater** (GitHub provider).
  * **Ed25519-signed manifest verification** before applying updates.
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
* CI/CD pipeline:

  * Automatic builds and GitHub Releases from tags (macOS + Linux AppImage).
  * Creation and signing of the release manifest (Ed25519).

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

  * Electron (latest LTS-compatible version).
  * TypeScript.
* **Renderer**

  * React + TypeScript.
  * Modern bundler (e.g., Vite or equivalent; exact tooling can be swapped if needed).
* **Cryptography**

  * Ed25519 signatures (e.g., via a small Node library; exact library TBD).
* **Packaging & Updates**

  * electron-builder.
  * electron-updater (GitHub provider, custom flow).
  * GitHub Releases as artifact host.

### 2.2 Supported Platforms

* **macOS**

  * Minimum version: **macOS 12+** (configurable).
  * Unsigned / self-signed binary; users must bypass Gatekeeper on first install.
  * Subsequent updates performed by app’s own updater.
* **Linux**

  * Target: modern distributions supporting **AppImage**.
  * Install location: per-user, writable (no root required) to allow self-updates.

### 2.3 Process Model

* **Main process**

  * Controls BrowserWindows.
  * Owns auto-update logic and Ed25519 verification.
  * Handles IPC requests for updates, configuration, logs, and system info.
* **Preload script**

  * `contextIsolation: true`, `nodeIntegration: false`.
  * Exposes a **strict, typed IPC façade** via `contextBridge` (`window.api`).
* **Renderer process**

  * React app rendering layout (header/footer/sidebar/main).
  * Consumes `window.api.*` methods; no direct Node access.

### 2.4 Directory Structure

Base structure (Option B – modular, domain-separated):

```text
/src
  /main
    /update          # auto-update orchestration, GitHub/electron-updater integration
    /security        # Ed25519 verification, manifest/hash checks
    /ipc             # IPC channel definitions and handlers
    /config          # config loading/saving (JSON)
    /logging         # log file management
    main.ts          # app bootstrap, window creation, wiring
  /renderer
    /layout          # header, footer, sidebar, main layout components
    /components      # shared UI components (buttons, panels, indicators)
    /features
      /status        # status dashboard feature
      /updates       # sidebar update UI, hooks for update state
    index.tsx        # React bootstrap
  /common            # shared types, enums, constants (between main & renderer)
  /assets            # icons, images, fonts (placeholder initial icon)
/scripts             # build, release, manifest signing scripts
/release             # built artifacts & manifest.json
/tests               # unit and integration tests
package.json
tsconfig.json
electron-builder.yml (or electron-builder.config.*)
vite.config.ts (or equivalent bundler config)
```

---

## 3. Core Functionality (Initial Release)

### 3.1 Self-Update Flow (High-level)

**Update backend:**

* GitHub Releases, with semantic version tags: `vMAJOR.MINOR.PATCH` (e.g., `v1.2.3`).
* `package.json` version: `MAJOR.MINOR.PATCH` (must match tag number).
* Build artifacts for each release:

  * macOS: `.dmg` or `.zip` (decision per packaging best practice).
  * Linux: `.AppImage`.
* A signed **manifest JSON** (see §4) stored in the same GitHub Release.

**On application start:**

1. Load configuration (JSON).
2. Initialize logging.
3. Create BrowserWindow and load React UI.
4. Kick off **background update check**:

   * Use `electron-updater`’s `autoUpdater.checkForUpdates()` (no auto-notify) or equivalent.
   * Listen for events and propagate status via IPC to renderer.

**Update UX (UI model: explicit states):**

* The app remains usable during update checking/download.
* Update control is presented **at the bottom of the left sidebar**.

Timeline:

1. **Idle state**:

   * Sidebar shows e.g. “Up to date” or “No updates checked yet”.
   * Optional “Check for update” button.

2. **Checking state**:

   * Sidebar shows spinner + text “Checking for updates…”.

3. **Update available**:

   * Sidebar indicates “Update available vX.Y.Z”.
   * User can initiate download with a button: “Download update”.

4. **Downloading**:

   * Sidebar shows progress: percentage and/or bytes.
   * Update progress remains visible; app content is usable.

5. **Download complete & verified**:

   * The main process:

     * Verifies the Ed25519-signed manifest.
     * Verifies the downloaded artifact’s hash matches the manifest.
   * If verification succeeds:

     * Sidebar shows “Update ready – Restart to apply”.
     * Button: “Restart to update”.
   * If verification fails:

     * Sidebar shows error state, provides “Retry” and logs entry.

6. **Restart to install**:

   * On user click:

     * Main process calls `autoUpdater.quitAndInstall()` or equivalent custom installer invocation.
     * App quits and relaunches into the **new version**.
   * On next startup:

     * (Future) DB migrations run if present.
     * Configuration and log locations remain stable.

### 3.2 electron-updater Integration

* Dependency: `electron-updater` in main process.

* Usage:

  * Configure `autoUpdater` with GitHub provider using electron-builder config.
  * Prefer **manual control model**:

    * `autoUpdater.checkForUpdates()`.
    * Handle `update-available`, `download-progress`, `update-downloaded`, `error`, `update-not-available`.
    * Use `autoUpdater.downloadUpdate()` only after user chooses to download.
    * Call `autoUpdater.quitAndInstall()` when the user initiates restart **after manifest verification**.

* `autoUpdater` event handlers:

  * Forward status to renderer via IPC, e.g.:

    * `update:status` with payload:

      * `state` (`idle | checking | available | downloading | downloaded | error`).
      * `availableVersion`.
      * `progress` (0–100, bytes downloaded / total).
      * `message` (human-readable).
    * `update:log` for update-related messages (optional).

### 3.3 UI Layout & Behavior

* **Header**

  * App title, placeholder for future top-bar icon/symbol.
  * Basic menu/placeholder area (e.g., future settings/help icons).

* **Footer**

  * Short text: e.g., `vX.Y.Z` (current version, from IPC).
  * Platform indicator (e.g., “macOS” or “Linux”).
  * Optional status text (“All systems normal”).

* **Sidebar (left)**

  * Upper portion:

    * Placeholder navigation items (e.g., “Status”).
  * Lower portion:

    * **Update module**:

      * Status text.
      * Progress bar (for downloading).
      * Button(s): “Check for update”, “Download update”, “Restart to update” (context-dependent).
    * Error indicator if last update failed.

* **Main area (right) — Status Dashboard**

  * Cards/sections:

    * **App Info**:

      * App name.
      * Current version.
      * Build channel (stable; later could add pre-release).
    * **System Info**:

      * OS name, version.
      * Architecture.
    * **Update Status**:

      * Last update check time.
      * Result (up to date / available / failed).
    * **Recent Logs**:

      * Tail of log with filter on update-related entries.
      * Clear log view / open log file button.

### 3.4 Logging

* Logging subsystem in `/src/main/logging`:

  * Writes to a log file in user data directory:

    * macOS: `~/Library/Application Support/<AppName>/logs/<date>.log`
    * Linux: `$XDG_STATE_HOME/<AppName>/logs/` or fallback under `$HOME/.local/state/<AppName>/logs/`.
  * Log levels: `debug`, `info`, `warn`, `error`.

* Log entries include:

  * App lifecycle events (start, stop).
  * Update events (check, available, download progress, download complete, verification success/failure, install start).
  * Significant errors (IPC errors, config load/save failures).

* Renderer access:

  * IPC method to fetch a small window of recent log lines (e.g., last 200 lines) to display in status dashboard.
  * No direct file access from renderer.

### 3.5 Configuration

* Config file:

  * Location:

    * macOS: `~/Library/Application Support/<AppName>/config.json`.
    * Linux: `$XDG_CONFIG_HOME/<AppName>/config.json` or fallback to `$HOME/.config/<AppName>/config.json`.
  * Schema (initial version):

    ```jsonc
    {
      "autoUpdateEnabled": true,          // whether to check for updates at startup
      "allowPrerelease": false,           // future use
      "updateCheckIntervalHours": 0,      // 0 = only at startup, may extend later
      "logLevel": "info"                  // "debug" | "info" | "warn" | "error"
    }
    ```

* Behavior:

  * On startup: load config; if file missing, use defaults and create file.
  * On update: config schema may be extended; maintain backward compatibility.
  * IPC methods: `config.get()`, `config.update(partialConfig)` (used by future settings UI).

---

## 4. Update Security Model

### 4.1 Ed25519 Signing

* A **release manifest JSON** is generated for each GitHub Release by CI.

Example `manifest.json`:

```json
{
  "version": "1.2.3",
  "createdAt": "2025-01-01T12:00:00Z",
  "artifacts": [
    {
      "platform": "macos",
      "type": "dmg",
      "filename": "AppName-1.2.3-mac.dmg",
      "sha256": "<hex-encoded-sha256>"
    },
    {
      "platform": "linux",
      "type": "AppImage",
      "filename": "AppName-1.2.3.AppImage",
      "sha256": "<hex-encoded-sha256>"
    }
  ],
  "signature": "<base64-ed25519-signature-over-manifest-without-signature-field>"
}
```

* CI steps:

  1. Build artifacts for macOS and Linux.
  2. Compute SHA-256 for each artifact.
  3. Create `manifest.json` (without `signature`).
  4. Sign the canonicalized manifest (e.g., stable JSON serialization) with Ed25519 private key.
  5. Insert `signature` field.
  6. Upload `manifest.json` to the GitHub Release alongside artifacts.

* Private key handling:

  * Stored securely in GitHub Actions secrets.
  * Never checked into repository.
  * Used exclusively in CI scripts under `/scripts/sign-manifest.ts` (or similar).

* App-side:

  * Embed corresponding Ed25519 **public key** constant in `/src/main/security/publicKey.ts`.
  * `security.verifyManifest(manifestJson)`:

    * Ensures manifest version is greater than app’s current version before accepting.
    * Validates Ed25519 signature.
    * Verifies all listed artifacts have valid `sha256` values.
  * `security.verifyArtifact(artifactPath, manifestEntry)`:

    * Computes SHA-256 for downloaded file.
    * Compares to `manifestEntry.sha256`.

### 4.2 Verification Flow

1. `autoUpdater` identifies a new version and downloads the artifact.
2. Main process:

   * Downloads `manifest.json` from GitHub.
   * Calls `verifyManifest`.
   * Finds the artifact entry matching current platform.
   * Calls `verifyArtifact`.
3. If both manifest and artifact verification succeed:

   * App updates UI state to “update ready”.
   * Allows `quitAndInstall`.
4. If verification fails:

   * App logs detailed error.
   * Does **not** apply the update.
   * Sidebar shows error state; user can retry or ignore.

### 4.3 MacOS & Linux Security Constraints

* macOS:

  * No Apple notarization; system-level trust is limited to user accepting the app once.
  * After first install, updates are enforced by:

    * Ed25519 signatures for integrity & authenticity.
    * GitHub HTTPS delivery.

* Linux:

  * Similar Ed25519 + HTTPS model.
  * No distribution packaging trust (e.g., no .deb with distro keys) by default.

---

## 5. Non-Functional Requirements

### 5.1 Performance

* Startup time:

  * App main window should be visible within **2 seconds** on typical hardware.
* Update check:

  * Background check should not block UI.
  * Update status should appear in sidebar within **5 seconds** of startup (network permitting).

### 5.2 Reliability

* The app must:

  * Start and function normally when:

    * GitHub is unreachable.
    * Manifest or artifact downloads fail.
  * Never apply a partially downloaded or unverified update.
  * Continue using the currently installed version when update fails.

* Crash safety:

  * If app crashes during download:

    * On next startup, any incomplete update is discarded and a new check is performed.

### 5.3 Security

* Renderer:

  * `nodeIntegration: false`.
  * `contextIsolation: true`.
  * Strict `preload` API: only whitelisted IPC calls.
* IPC:

  * No generic `eval` or dynamic code loading.
  * Typed channels, e.g., `updates:check`, `updates:getStatus`, `updates:restart`, `logs:getRecent`.
* Content:

  * Only load local renderer code (no remote URLs).
  * Optional CSP in HTML to restrict resources.
* Updates:

  * HTTPS + Ed25519 + SHA-256 verification.

### 5.4 Privacy

* No external telemetry.
* No user data sent to any server (other than standard GitHub update HTTP requests).
* Logs stored locally only.

### 5.5 Accessibility (Baseline)

* Keyboard navigation for sidebar and main content (focus states, tab order).
* Reasonable color contrast for default theme.
* Text content readable; no tiny fonts.
* Future TODO: ARIA landmarks and screen-reader optimizations.

### 5.6 Internationalization

* Initial release: English-only text.
* All user-visible strings centralized to facilitate future i18n (e.g., `src/renderer/i18n/en.ts`).

---

## 6. Data & Interfaces

### 6.1 Domain Data

Initial domain entities:

* **AppVersion**

  * `currentVersion: string`
  * `latestKnownVersion?: string`
  * `channel: "stable"` (future: `beta`, etc.)

* **UpdateStatus**

  * `state: "idle" | "checking" | "available" | "downloading" | "downloaded" | "error"`
  * `availableVersion?: string`
  * `progress?: { percent: number; transferred: number; total?: number }`
  * `lastCheckAt?: string`
  * `errorMessage?: string`

* **SystemInfo**

  * `platform: "macos" | "linux"`
  * `osVersion: string`
  * `arch: string`

* **Config**

  * As defined in §3.5.

* **LogEntry**

  * `timestamp: string`
  * `level: "debug" | "info" | "warn" | "error"`
  * `message: string`
  * `context?: Record<string, unknown>`

### 6.2 IPC Surface (Preload API)

Exposed via `contextBridge` as `window.api` (TypeScript types in `/src/common/ipc.ts`):

```ts
interface UpdatesAPI {
  checkNow(): Promise<void>;
  getStatus(): Promise<UpdateStatus>;
  onStatusChanged(callback: (status: UpdateStatus) => void): () => void; // returns unsubscribe
  restartToApplyUpdate(): Promise<void>;
}

interface SystemAPI {
  getInfo(): Promise<SystemInfo>;
}

interface LogsAPI {
  getRecent(limit?: number): Promise<LogEntry[]>;
}

interface ConfigAPI {
  get(): Promise<Config>;
  update(patch: Partial<Config>): Promise<Config>;
}

interface AppAPI {
  getVersion(): Promise<string>;
}

declare global {
  interface Window {
    api: {
      updates: UpdatesAPI;
      system: SystemAPI;
      logs: LogsAPI;
      config: ConfigAPI;
      app: AppAPI;
    };
  }
}
```

IPC implementation details:

* Separate channels (e.g., `updates:check`, `updates:getStatus`, `updates:subscribe`).
* Renderer never directly uses `ipcRenderer`; only uses `window.api`.

### 6.3 Future SQLite Integration (Design Hooks)

Not implemented in initial release, but design must anticipate:

* A dedicated `/src/main/db` module.
* DB file located in user data directory.
* Schema versioning and migrations:

  * Table for metadata (e.g., `schema_version`).
  * **Automatic migrations on startup**:

    * Run before UI is loaded.
    * If migration is fast, no extra UI shown.
    * If migration is potentially long or complex:

      * Show a minimal “Updating data…” screen (splash or blocking view) before main UI.

---

## 7. Build, Packaging & CI

### 7.1 electron-builder Configuration

* `electron-builder.yml` or equivalent:

  * **App metadata**

    * `appId`: `com.example.<appname>`
    * `productName`: `<AppName>`
    * `directories.output`: `release/`

  * **Files**

    * Include `dist` (renderer bundle), main TS compiled JS, assets.

  * **macOS target**

    * `mac`:

      * `target`: `["dmg", "zip"]` (choose at least one).
      * `category`: `"public.app-category.productivity"` or similar.
      * **Note**: signing config either disabled or minimal self-sign; no notarization.

  * **Linux target**

    * `linux`:

      * `target`: `["AppImage"]`
      * `category`: `"Utility"` or similar.

  * **Publish**

    * `publish`:

      * `provider`: `"github"`
      * `owner`: `<github-user-or-org>`
      * `repo`: `<repo-name>`

### 7.2 GitHub Repository & Releases

* Repo:

  * Hosted on GitHub: `<github-user-or-org>/<repo-name>`.
* Versioning:

  * Tags in format `vMAJOR.MINOR.PATCH`.
  * `package.json` version: `MAJOR.MINOR.PATCH` to match tag.
* Releases:

  * Created automatically by CI on tag push.
  * Attach artifacts:

    * macOS `.dmg` / `.zip`.
    * Linux `.AppImage`.
    * `manifest.json` (signed).

### 7.3 GitHub Actions CI

Workflow triggers:

* On `push` of tags matching `v*`.

Jobs:

1. **build-linux**

   * Runs on `ubuntu-latest`.
   * Installs dependencies.
   * Builds AppImage via electron-builder.
   * Produces artifact: `AppName-<version>.AppImage`.

2. **build-macos**

   * Runs on `macos-latest`.
   * Installs dependencies.
   * Builds macOS target(s).
   * Produces artifact(s): `.dmg` and/or `.zip`.

3. **create-release-and-sign**

   * Needs `build-linux` and `build-macos`.
   * Creates or updates GitHub Release corresponding to the tag.
   * Computes SHA-256 hashes.
   * Generates unsigned `manifest.json`.
   * Signs manifest using Ed25519 private key from secrets.
   * Uploads artifacts and `manifest.json` to the Release.

Security:

* Ed25519 private key stored in a GitHub Actions secret.
* CI uses short-lived environment variables to pass key to signing script.

---

## 8. Constraints & Assumptions

* **No Windows** support in initial scope.
* **No Apple ID or notarization**; users must manually allow app on macOS.
* **No backend server** besides GitHub; all update and signing infrastructure is GitHub + CI.
* App requires:

  * Internet connectivity to check for and download updates.
  * File system permissions to write config, logs, and future DB.

---

## 9. Acceptance Criteria

### 9.1 Installation & Startup

* App installs and starts successfully on:

  * macOS 12+ (after user bypasses Gatekeeper once).
  * A supported Linux distribution using AppImage.

* On first launch:

  * Header, footer, sidebar, and main area are visible.
  * Sidebar shows an update status component at its bottom.
  * Main area shows status dashboard with:

    * Current version.
    * Platform information.
    * Last update check as “Never” or equivalent.

### 9.2 Update Behavior

* When a new release is published on GitHub:

  * An app with an older version, on startup, eventually transitions:

    * `idle → checking → available → downloading → downloaded`.
  * Sidebar reflects these states with appropriate labels and progress.
  * After download and successful verification:

    * Sidebar shows “Update ready – Restart to apply” with a button.
  * On clicking the button:

    * App restarts and runs the new version (version text updated in footer and status dashboard).

* When no new release is available:

  * App shows `idle → checking → idle` with “Up to date” message.

* Update failures (e.g., network issue, manifest signature invalid, hash mismatch):

  * Do not cause the app to crash.
  * Result in:

    * Log entry at `error` level.
    * Sidebar showing “Update failed” or similar.
    * App remains usable.

### 9.3 Security & IPC

* Renderer has no direct access to Node APIs:

  * `nodeIntegration` disabled.
  * `contextIsolation` enabled.
* All operations (update check, restart, config access, logs access, system info, version) are performed via `window.api.*` methods.
* Update is not applied if:

  * Manifest verification fails.
  * Artifact hash verification fails.

### 9.4 Logging & Config

* A log file is created on first run in the user’s data directory.
* Status dashboard can display recent log entries.
* Changing log level in config (if manually edited) affects new log entries on next startup.
* Config file is created with default values if nonexistent, and loading it does not crash the app even if partially corrupted (fallback to defaults with logged warning).

### 9.5 UX & Layout

* Layout is consistent across platforms:

  * Header at top, footer at bottom, sidebar left, main content right.
* Sidebar update indicator is always visible and does not block user interaction with the main area.
* Keyboard navigation:

  * Tab order allows reaching sidebar controls and main content.
* Text and colors are readable under default OS conditions.

---

## 10. Delivery & Milestones

### Milestone 1 — Core Shell & Local Build

* Electron + React + TypeScript project scaffolded.
* Layout implemented (header, footer, sidebar, main).
* Preload and strict IPC façade in place.
* Status dashboard displays:

  * Version (hardcoded or read from package metadata via IPC).
  * Platform info.
* Local logging to file implemented.
* Local config (JSON) implemented with default values.

### Milestone 2 — Self-Update Integration (GitHub + electron-updater)

* electron-builder configured for macOS + Linux AppImage.
* GitHub Releases integrated (manual / local test).
* `autoUpdater` wired in with event handling.
* Sidebar update UI integrated with actual update state from main process.
* Update flow:

  * Check → available → download → ready → restart.
* Basic manifest download (without yet verifying Ed25519) wired in.

### Milestone 3 — Ed25519 Security & CI

* Ed25519 public key embedded in app.
* Ed25519 private key set up as CI secret.
* CI pipeline:

  * Builds artifacts.
  * Computes hashes.
  * Generates and signs `manifest.json`.
  * Publishes artifacts + manifest to GitHub Release.
* App verifies manifest and artifact before applying update.
* Negative tests:

  * Tampered manifest.
  * Tampered artifact.
  * Both rejected and logged.

### Milestone 4 — Polish & Hardening

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
  * Automatic migrations on startup with optional “Updating data…” screen.
* Add icons and top bar symbol.
* Introduce feature pages in main area (beyond status dashboard).
* Add settings UI for configuration:

  * Auto-update toggle.
  * Log level, etc.
* Optional telemetry (if ever desired) as explicit opt-in.

---
