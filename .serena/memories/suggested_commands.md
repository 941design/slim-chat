# Suggested Commands for Nostling Development

## Development Commands

### Starting Development Mode
```bash
npm run dev          # Start all processes (main, preload, renderer) with hot reload
make dev             # Alternative using Makefile
```

### Individual Process Development
```bash
npm run dev:main     # Main process only - backend development
npm run dev:preload  # Preload script only - API bridge development
npm run dev:renderer # Renderer process only - frontend/UI development
```

## Building

### Production Build
```bash
npm run build        # Build entire application (clean + build all processes)
make build           # Alternative using Makefile
```

### Individual Component Builds
```bash
npm run build:main      # Main process only
npm run build:preload   # Preload script only
npm run build:renderer  # Renderer process only
```

## Testing

### Unit Tests
```bash
npm test                # Run all unit tests with Jest
npm run test:watch      # Run tests in watch mode
make test               # Alternative using Makefile
make test-watch         # Watch mode via Makefile
```

### End-to-End Tests
```bash
npm run test:e2e        # Run E2E tests in headless mode (builds first)
npm run test:e2e:ui     # Run E2E tests in interactive UI mode
npm run test:e2e:headed # Run E2E tests with visible Electron window
npm run test:e2e:debug  # Debug E2E tests with Playwright Inspector
make test-e2e           # Alternative via Makefile
make test-all           # Run both unit and E2E tests
```

## Code Quality

### Type Checking
```bash
npm run lint    # Run TypeScript type checking
make lint       # Alternative using Makefile
```

## Packaging and Release

### Package Application
```bash
npm run package  # Build and create distributable packages
make package     # Alternative using Makefile
```

### Full Release Build
```bash
make release     # Full workflow: clean, install, build, package, sign manifest
```

### Sign Update Manifest
```bash
npm run sign:manifest  # Generate and sign update manifest
make sign-manifest     # Alternative using Makefile
```

## Maintenance

### Cleanup
```bash
npm run clean     # Remove build artifacts (dist, out, release)
make clean        # Alternative using Makefile
make dist-clean   # Deep clean including node_modules
```

### Install Dependencies
```bash
npm install       # Install all dependencies
make install      # Alternative using Makefile
```

## CI/CD

### Verification
```bash
make verify       # Run lint + all tests (unit + E2E)
make ci           # Full CI pipeline: install, verify, build
```

## Makefile Help
```bash
make help         # Show all available make targets
```

## macOS System Commands
Since this project runs on macOS (Darwin), standard Unix commands are available:
- `ls`, `cd`, `pwd` - directory navigation
- `grep`, `find` - searching
- `cat`, `less` - viewing files
- `git` - version control
- `open` - open files/apps (macOS-specific)
