# Nostling - Project Overview

## Purpose
Nostling is a desktop messaging application built on the Nostr protocol with Electron, React, and TypeScript. It provides secure, decentralized communication through end-to-end encrypted messages with a built-in auto-update system that uses cryptographic verification.

The main features include:
- Secure auto-update system with Ed25519 signature verification
- SHA-256 hash verification for downloaded artifacts
- Version validation to prevent downgrade attacks
- Electron 30 as the desktop framework
- React 18 for the UI
- Comprehensive test coverage (unit tests with Jest + E2E tests with Playwright)

## Tech Stack
- **Desktop Framework**: Electron 30
- **Frontend**: React 18, TypeScript
- **Build Tools**: 
  - tsup for main and preload processes
  - Vite for renderer process
  - electron-builder for packaging
- **Testing**:
  - Jest with ts-jest for unit tests
  - Playwright for E2E tests
  - fast-check for property-based testing
- **Security**: tweetnacl for Ed25519 cryptography
- **Package Manager**: npm
- **Node Version**: 20.x

## Codebase Structure

```
nostling/
├── src/
│   ├── main/           # Electron main process (Node.js backend)
│   │   ├── index.ts    # Main entry point, window management, auto-updater setup
│   │   ├── config.ts   # Configuration management
│   │   ├── logging.ts  # Logging setup
│   │   ├── integration.ts # Integration tests
│   │   ├── ipc/        # IPC handlers for communication with renderer
│   │   ├── security/   # Cryptographic verification (Ed25519, SHA-256, version validation)
│   │   └── update/     # Update controller and manifest generation
│   ├── preload/        # Preload script (secure bridge between main and renderer)
│   │   └── index.ts    # Exposes safe APIs to renderer via contextBridge
│   ├── renderer/       # React frontend (Chromium-based UI)
│   │   ├── main.tsx    # React entry point
│   │   ├── index.html  # HTML template
│   │   └── styles.css  # Styles
│   └── shared/         # Shared types between processes
│       └── types.ts    # TypeScript type definitions
├── e2e/                # End-to-end tests with Playwright
├── scripts/            # Build and release scripts
├── dist/               # Build output (gitignored)
├── release/            # Packaged distributables (gitignored)
└── node_modules/       # Dependencies (gitignored)
```

## Electron Architecture
The application follows Electron's three-process architecture:
1. **Main Process**: Node.js backend managing lifecycle, windows, file system, auto-updates
2. **Preload Script**: Security bridge exposing APIs via contextBridge
3. **Renderer Process**: Sandboxed Chromium running the React app

## Platform Support
- macOS: DMG and ZIP distributions
- Linux: AppImage
- Windows: Previously supported, now removed (as of commit 557336c)
