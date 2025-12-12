# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Relay Manager Redesign**: Enhanced relay configuration with filesystem-based persistence
  - Compact table layout with high-density rows (≤36px) using @tanstack/react-table
  - Drag-and-drop reordering via dnd-kit with visual feedback
  - Per-relay read/write policies via checkbox controls (subscription vs publishing)
  - Live connection status indicators (green/yellow/red dots) based on WebSocket state
  - Filesystem-based configuration stored at `~/.config/nostling/identities/<id>/relays.json`
  - Hash-based overwrite protection using SHA-256 to detect external config changes
  - Conflict resolution modal with Reload/Overwrite/Cancel options
  - One-time idempotent migration from SQLite database to filesystem
  - Property-based integration tests: 50 tests covering table operations, drag-and-drop, policies, migration, and conflict resolution
  - Total test suite: 746 tests, all passing with zero regressions

### Added
- **Ostrich-Themed Status Messages**: Playful, randomly-selected status messages throughout the application
  - Themed alternatives for update status messages (e.g., "Standing tall" for "Up to date", "Pecking up" for "Downloading")
  - Themed alternatives for Nostling queue status (e.g., "Flock gathered" for "Queued", "Wings spread" for "Sending")
  - JSON-based configuration with 2-3 variations per status type for variety
  - Runtime validation with graceful fallback to default messages
  - Preserves all dynamic content (versions, progress percentages, counts, error messages)
  - Property-based testing: 72 new tests (11 integration, 39 update status, 22 Nostling status)
  - E2E tests updated to support random themed message selection
  - Total test suite: 640 tests, all passing with zero regressions
- **Persistence Layer**: SQLite-based application state storage with automatic schema migrations
  - SQLite database (`nostling.db`) using sql.js WebAssembly implementation
  - Knex.js-compatible migration system for schema versioning
  - Key-value state storage for application preferences and settings
  - IPC handlers: `state:get`, `state:set`, `state:delete`, `state:get-all`
  - Automatic migration execution on application startup
  - Property-based integration tests covering CRUD operations, migration sequences, and concurrency patterns
  - Database location: `{userData}/nostling.db`
- **Auto-Update Footer Integration**: Streamlined update experience with automatic checks and real-time progress
  - Automatic update checks on application startup (5-second delay) and at configurable intervals
  - Configurable check intervals: 1h, 2h, 4h, 12h, 24h, or never (default: 1 hour)
  - Real-time download progress display with percentage, transferred/total size, and download speed
  - Manual refresh control with circular arrow icon (↻) for immediate update checks
  - Combined version and update status display (e.g., "v1.0.0 • Up to date", "v1.0.0 • Update available: v1.0.1")
  - Context-aware action buttons: "Download Update" when available, "Restart to Update" when ready
  - Graceful error handling with user-friendly messages and retry capability
  - Refresh button automatically disabled during busy phases (checking, downloading, verifying)
  - Manual checks reset automatic check timer to prevent double-checking
  - Comprehensive property-based integration tests: 50 new tests covering footer behavior and auto-check lifecycle
  - Total test suite: 377 tests, all passing with zero regressions

### Changed
- Relocated update controls from sidebar to application footer for better visibility and discoverability
- Sidebar simplified: removed update-related controls and status displays (structure preserved for future features)

### Fixed
- Fixed WebSocket implementation for Nostr relay connections in Node.js/Electron environment
  - Added ws package as WebSocket implementation for nostr-tools library
  - Root cause: nostr-tools SimplePool required explicit WebSocket for non-browser contexts
  - Used useWebSocketImplementation() to provide ws package to nostr-tools
  - Relay connections now establish successfully in Electron main process
  - Added regression tests to verify relay connections work without "WebSocket is not defined" errors
  - Bug report: bug-fix-contract-websocket.md
- Enhanced footer error display to show more of the error message
  - Added title attribute for tooltip showing full error text on hover
  - Added maxW and truncate to prevent error text from overflowing footer
  - Applied same enhancement to relay hover info display
- Fixed RelayTable layout and interaction bugs (relay configuration UI)
  - Tooltip hover on status dot no longer causes table row height to jump from 36px
  - All checkboxes (Enabled, Read, Write) now respond correctly to clicks
  - Root cause: Tooltip rendered inline without portal positioning, causing layout reflow
  - Root cause: Checkbox handlers used incorrect event type (React.ChangeEvent vs CheckboxCheckedChangeDetails)
  - Added `positioning={{ strategy: 'fixed' }}` to Tooltip.Root to prevent layout interference
  - Updated checkbox handlers to accept Chakra UI v3's CheckboxCheckedChangeDetails type
  - Added 2 regression tests to verify tooltip positioning and checkbox type safety
  - Bug report: bug-reports/relay-table-tooltip-checkbox-bug-report.md
- Fixed macOS Gatekeeper warnings on auto-updated applications (auto-updates)
  - Configured electron-builder to use unsigned builds with `identity: null`
  - Apps remain unsigned but install correctly; users approve once in System Settings
  - Root cause: electron-builder was attempting to sign with ad-hoc signature
  - Added production logging for signing configuration and update installation
  - Added regression test validating package.json configuration
  - Bug report: bug-reports/macos-gatekeeper-warning-unsigned-app.md

### Changed
- Simplified UI by removing Status Dashboard from main area
  - Moved "Last Update Check" timestamp to footer alongside version info
  - Removed InfoCard, LogPanel, and StatusDashboard components
  - Main content area now available for future features

### Added
- **Dev Mode Update Testing**: Test auto-updates locally before releasing to users
  - Automatic dev mode detection via `VITE_DEV_SERVER_URL` environment variable
  - Configure update source via `DEV_UPDATE_SOURCE` environment variable
  - Test pre-release versions with `ALLOW_PRERELEASE=true` flag
  - Production safety enforced: dev features automatically disabled in packaged builds
  - Configurable manifest fetch timeout (default: 30 seconds) prevents indefinite hangs
  - Concurrency protection: prevents race conditions from overlapping update checks
  - Comprehensive test coverage: 292 tests including property-based tests for state machine
  - Full diagnostic logging for update check process, version comparisons, and signature verification
- **GitHub Provider Hardening**: Enhanced security and stability for the update system
  - Download concurrency protection: prevents race conditions from simultaneous downloads
  - File protocol support for dev mode testing with local file:// URLs
  - URL validation at setup time with fail-fast error reporting
  - Error message sanitization: prevents sensitive implementation details from leaking in logs
  - GitHub constants extraction: single source of truth for owner/repo configuration
  - Comprehensive integration tests for E2E version transitions and dev mode patterns
  - 338 tests total with enhanced edge case coverage

### Changed
- **BREAKING**: Migrated auto-update signature verification from Ed25519 to RSA-4096
  - Update manifests now use RSA-4096 signatures (SHA-256 with RSA)
  - Build script requires `NOSTLING_RSA_PRIVATE_KEY` environment variable (PEM format)
  - Application requires `RSA_PUBLIC_KEY` for manifest verification (PEM format)
  - **Migration Required**: Developers and CI/CD pipelines must generate new RSA-4096 keypairs
  - See README.md "RSA Key Setup" section for key generation and configuration instructions

### Fixed
- Fixed manifest.json missing macOS .dmg artifact in GitHub releases, breaking auto-update for macOS users
  - Root cause: Manifest generated on ubuntu-latest runner before macOS artifacts available
  - Moved manifest generation from build job to create-release job after all artifacts consolidated
  - Added manifest validation to verify all expected platform artifacts present
  - Deleted dead code: manifest-generator.ts and its test (superseded by inline generation)
  - Added 5 regression tests to verify manifest includes all platform artifacts
  - Bug report: bug-reports/manifest-missing-artifacts-report.md
- Fixed duplicate release asset uploads in release workflow
  - Root cause: Glob pattern matched identical filenames (builder-debug.yml, app-update.yml) from both platform builds, causing upload conflicts
  - Changed pattern from `**/*.yml` to `**/latest-*.yml` to match only platform-specific update files
  - Added regression test to verify no duplicate basenames in upload patterns
  - Bug report: bug-reports/duplicate-release-assets-upload-report.md
- Fixed auto-update 404 error when checking for updates
  - Root cause: setupUpdater() did not configure electron-updater's feed URL, causing it to default to GitHub provider which expects latest-mac.yml instead of manifest.json
  - Added setFeedURL() call with generic provider configuration
  - Added regression tests to verify generic provider configuration
  - Bug report: bug-reports/bug-auto-update-404.md
- Fixed crypto test error handling assertion to use duck-typing instead of instanceof check
  - Root cause: Error constructors don't preserve instanceof across module boundaries in Jest
  - Updated assertion to check error message content instead of error type
  - Bug report: bug-reports/crypto-test-error-handling.md
- Fixed window creation timing race condition in E2E tests
  - Root cause: Window loaded event fired before IPC handlers were registered
  - Added proper await for DOM content loaded state before launching app
  - Ensures renderer is ready before test interactions
  - Bug report: bug-reports/window-creation-timing.md
- Fixed missing IPC handler errors in E2E tests by adding legacy handler compatibility
  - Root cause: Tests referenced deprecated IPC handlers that were removed in refactoring
  - Added three legacy handlers: get-app-version, get-platform, and open-external-link
  - Maintains backward compatibility with existing test suite
  - Bug report: bug-reports/ipc-handler-registration.md
- Fixed electronApp.evaluate() context isolation violations in E2E tests
  - Root cause: require() calls in evaluate() broke Electron's context isolation
  - Replaced require() with conditional imports and native Node.js modules
  - Ensures tests run in proper sandboxed contexts
  - Bug report: bug-reports/electron-app-evaluate.md
- Removed unused app import that caused dead code warning
  - Cleaned up imports to eliminate unnecessary dependencies
- Fixed download update button calling checkForUpdates() instead of downloadUpdate()
  - Root cause: handlePrimary() called onCheck() for all non-ready phases including 'available'
  - Added explicit else-if case for 'available' phase to call onDownload()
  - Added error handling for async IPC calls with proper error state transitions
  - Disabled button during 'checking' phase to prevent user-triggered concurrency issues
  - Added regression test to verify download button behavior
  - Bug report: bug-reports/download-update-button-not-working-report.md
- Fixed footer timestamp not updating immediately when update checks complete
  - Root cause: onUpdateState listener only updated updateState, not full AppStatus including lastUpdateCheck
  - Footer displayed stale "Not yet checked" until user manually reloaded page
  - Added status refresh when update check completes (idle/failed states)
  - Added regression tests to verify timestamp updates for all check completion scenarios
  - Bug report: bug-reports/footer-timestamp-not-updating-report.md
- Fixed update signature verification failure after clicking "Restart to Update" button (auto-updates)
  - Changed autoUpdater.autoInstallOnAppQuit from false to true
  - Moves Squirrel.Mac verification to download phase instead of quitAndInstall phase
  - Prevents "Manifest signature verification failed" error when restarting to install update
  - Root cause: With autoInstallOnAppQuit=false, quitAndInstall() triggered Squirrel.Mac to re-fetch and verify update, failing on ad-hoc signed apps
  - Added regression test verifying autoInstallOnAppQuit=true is set correctly
  - Bug report: bug-reports/0015-update-signature-verification-after-restart-report.md
  - NOTE: Requires manual testing on macOS arm64 to confirm Squirrel.Mac accepts ad-hoc signed apps with this configuration
- Fixed update not installed after restart causing re-download loop (auto-updates)
  - Changed restartToUpdate() to use app.quit() instead of autoUpdater.quitAndInstall()
  - Prevents redundant install attempts and repeated Gatekeeper warnings on macOS
  - Root cause: quitAndInstall() incompatible with autoInstallOnAppQuit=true causing conflicting install mechanisms
  - Added pre-quit validation to ensure autoInstallOnAppQuit is enabled
  - Added runtime concurrency guard to prevent race conditions during restart
  - Added 5 regression tests to verify restart behavior and configuration
  - Bug report: bug-reports/autoupdater-restart-download-loop.md
