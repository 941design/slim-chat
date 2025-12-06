# End-to-End Tests

This directory contains Playwright E2E tests for SlimChat.

## Test Structure

```
e2e/
├── fixtures.ts       # Custom Playwright fixtures for Electron
├── helpers.ts        # Test helper functions
├── app.spec.ts       # General application UI tests
├── updates.spec.ts   # Update system tests
├── window.spec.ts    # Electron window and security tests
└── logs.spec.ts      # Log panel tests
```

## Test Suites

### app.spec.ts
Tests basic application functionality:
- Application launch
- Header and footer display
- Version information
- Status dashboard
- Sidebar visibility
- Platform information

### updates.spec.ts
Tests the auto-update system:
- Update state transitions
- Button states and labels
- Update check functionality
- Download and verification flows
- Restart to update functionality

### window.spec.ts
Tests Electron window configuration:
- Window creation
- Context isolation
- Preload API availability
- Security settings
- IPC communication

### logs.spec.ts
Tests the logging system:
- Log panel display
- Log entry structure
- Timestamp formatting
- Log levels
- Empty state handling

## Fixtures

The test suite uses custom Playwright fixtures defined in `fixtures.ts`:

- `electronApp`: Launches the Electron application
- `page`: Provides access to the first window

These fixtures automatically handle application lifecycle (launch and cleanup).

## Helpers

Common helper functions in `helpers.ts`:

- `waitForAppReady()`: Wait for application to load
- `getAppVersion()`: Extract version from UI
- `getUpdatePhase()`: Get current update phase
- `clickButton()`: Click button by label
- `waitForUpdatePhase()`: Wait for specific update state

## Running Tests

### Headless Mode (Default)

Run all tests in headless mode (no visible window):
```bash
npm run test:e2e
# or
make test-e2e
```

This is the **default mode** - tests run in the background without showing the Electron window. Perfect for CI/CD and quick local testing.

### Interactive Modes

Run with UI mode for debugging:
```bash
npm run test:e2e:ui
# or
make test-e2e-ui
```

Run in headed mode to see the Electron window:
```bash
npm run test:e2e:headed
# or
make test-e2e-headed
```

Debug specific test with Playwright Inspector:
```bash
npm run test:e2e:debug
# or
make test-e2e-debug
```

## Writing New Tests

When adding new tests:

1. Import the custom fixtures:
   ```typescript
   import { test, expect } from './fixtures';
   ```

2. Use the provided `electronApp` and `page` fixtures:
   ```typescript
   test('my test', async ({ electronApp, page }) => {
     // Test code
   });
   ```

3. Wait for the app to be ready:
   ```typescript
   await waitForAppReady(page);
   ```

4. Use standard Playwright assertions and locators

## Best Practices

- Always wait for the app to be ready before interacting
- Use semantic locators (text, role, etc.) over CSS selectors when possible
- Keep tests isolated and independent
- Use helper functions for common operations
- Handle async operations properly with await
- Clean up resources (fixtures handle this automatically)

## CI/CD Integration

Tests are configured to:
- Run with 2 retries in CI (`retries: 2`)
- Use single worker for stability (`workers: 1`)
- Generate HTML reports
- Capture traces on first retry
- Take screenshots on failure
