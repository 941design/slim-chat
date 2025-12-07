# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **BREAKING**: Migrated auto-update signature verification from Ed25519 to RSA-4096
  - Update manifests now use RSA-4096 signatures (SHA-256 with RSA)
  - Build script requires `SLIM_CHAT_RSA_PRIVATE_KEY` environment variable (PEM format)
  - Application requires `RSA_PUBLIC_KEY` for manifest verification (PEM format)
  - **Migration Required**: Developers and CI/CD pipelines must generate new RSA-4096 keypairs
  - See README.md "RSA Key Setup" section for key generation and configuration instructions

### Fixed
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
