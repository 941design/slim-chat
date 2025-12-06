# Test Failures - Bug Report

## Bug Description
Multiple test failures across both unit tests (1 failure) and e2e tests (12 failures). The test suite is experiencing:
1. **Unit test failure**: Error handling test for non-existent files not throwing expected errors
2. **E2e test failures**: Multiple IPC handler mismatches, incorrect electronApp.evaluate() usage, and API exposure conflicts

## Expected Behavior
All tests should pass:
- Unit tests: `hashFile()` should throw filesystem error when given non-existent file path
- E2e tests: UI elements should be visible, IPC handlers should respond correctly, and `electronApp.evaluate()` should work without "require is not defined" errors

## Reproduction Steps
1. Run unit tests: `npm test`
2. Run e2e tests: `npx playwright test`
3. Observe failures

## Actual Behavior

### Unit Test Failure (1/227 tests failing):
```
✖ Error handling: Non-existent file throws error (1.047542ms)
  AssertionError [ERR_ASSERTION]: Must throw an Error
```
Test location: `src/main/security/crypto.test.ts:110-120`

The test expects `hashFile(nonExistentPath)` to throw an error but it's not throwing as expected.

### E2e Test Failures (12/30 tests failing):

**Category 1: IPC Handler Mismatches (1 failure)**
- `window.spec.ts:56` - "should be able to get app status via API"
  - Error: `No handler registered for 'status:get'`
  - Legacy API uses `status:get` channel but handler is registered as `system:get-status`

**Category 2: electronApp.evaluate() Usage Error (1 failure)**
- `logs.spec.ts:26` - "should display log entries with correct structure"
  - Error: `ReferenceError: require is not defined`
  - Line 32: `const { ipcMain } = require('electron');` inside `electronApp.evaluate()`
  - `require()` is not available in the evaluate() context

**Category 3: Window Creation Issues (2 failures)**
- `window.spec.ts:4` - "should create browser window"
  - Error: `expect(windows.length).toBeGreaterThan(0)` - received 0 windows
- `window.spec.ts:14` - "should have correct window dimensions"
  - Error: `Timeout 30000ms exceeded while waiting for event "window"`

**Category 4: UI Elements Not Rendering (6 failures)**
All failures are due to `status` being null, causing conditional rendering to show "Loading..." instead of actual content:
- `app.spec.ts:21` - Version shows "Loading ersion..." (appears to be missing 'v' in display)
- `app.spec.ts:29` - "Status dashboard" h2 not visible
- `app.spec.ts:56` - `.log-panel` not visible
- `app.spec.ts:63` - Platform card timeout (page closed)
- `logs.spec.ts:5` - `.log-panel` not visible
- `logs.spec.ts:12` - `.log-list` not visible

**Category 5: Timeouts (2 failures)**
- `app.spec.ts:63` - Platform information timeout (30s exceeded)
- `updates.spec.ts:35` - Last update check timeout (30s exceeded)

## Impact
- Severity: **High**
- Affected Users: Developers running tests, CI/CD pipeline
- Affected Workflows: Test suite completely broken - 13 total test failures blocking development and deployment

## Environment/Context
- Platform: darwin (macOS)
- Node.js: Running with native test runner and Jest
- Playwright: E2e testing framework
- Electron app with IPC communication

## Root Cause Hypothesis

### Issue 1: Unit Test - hashFile() Error Handling
**Location**: `src/main/security/crypto.ts:45-62`

The `hashFile()` function creates a read stream and attaches error handlers:
```typescript
export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => { hash.update(chunk); });
    stream.on('end', () => { resolve(hash.digest('hex')); });
    stream.on('error', (err) => { reject(err); });  // Line 58-60
  });
}
```

**Problem**: The error event listener is registered **after** the stream is created. There's a race condition where `fs.createReadStream()` might emit an error before the handler is attached, causing the error to be unhandled. The test at line 115 expects the promise to reject, but it may not be catching the error consistently.

### Issue 2: E2e Tests - IPC Handler Mismatch
**Locations**:
- `src/preload/index.ts:4-25` (legacy API)
- `src/preload/index.ts:28-57` (new API)
- `src/main/ipc/handlers.ts:65-89` (handler registration)

**Problem**: API migration in progress created mismatches:
- Legacy API at line 7: `ipcRenderer.invoke('status:get')`
- New API at line 54: `ipcRenderer.invoke('system:get-status')`
- Handler registered at `handlers.ts:65`: `ipcMain.handle('system:get-status', ...)`
- **No handler registered for `status:get`**

The preload script exposes both APIs (line 60):
```typescript
contextBridge.exposeInMainWorld('api', { ...legacyApi, ...api });
```

This creates conflicts where legacy API methods override new nested API structure.

### Issue 3: E2e Tests - electronApp.evaluate() Pattern
**Location**: `e2e/logs.spec.ts:29-43`

**Problem**: Using `require('electron')` inside `electronApp.evaluate()` fails because the evaluate context doesn't have Node.js `require()`. Dependencies must be passed as function parameters:

**Incorrect (current)**:
```typescript
await electronApp.evaluate(async ({ BrowserWindow }) => {
  const { ipcMain } = require('electron');  // FAILS
});
```

**Correct pattern**:
```typescript
await electronApp.evaluate(async ({ BrowserWindow, ipcMain }) => {
  // ipcMain available as parameter
});
```

### Issue 4: UI Not Rendering - Status null
**Location**: `src/renderer/main.tsx:152-166`

**Problem**: The `useStatus()` hook calls `window.api.getStatus()` which uses the legacy API channel `status:get` (from line 7 of preload), but no handler exists for this channel. This causes the API call to fail silently, leaving `status` as `null`, which triggers the "Loading..." conditional rendering.

## Constraints
- **Backward compatibility**: Must maintain both legacy flat API and new nested API during transition period (GAP-007)
- **API contracts**: Cannot break existing API methods - tests depend on `window.api.getStatus()` working
- **Error handling**: Must properly handle file system errors per contract in `crypto.ts:40-43`
- **E2e test patterns**: Must use correct Playwright Electron patterns for evaluate()

## Codebase Context

### Likely locations:
1. **Unit test fix**: `src/main/security/crypto.ts:45-62` - Fix event listener attachment timing
2. **IPC handler registration**: `src/main/ipc/handlers.ts:56-90` - Add missing legacy handlers or fix registration
3. **Preload API exposure**: `src/preload/index.ts:1-63` - Fix API merging strategy
4. **E2e test pattern**: `e2e/logs.spec.ts:26-43` - Fix require() usage in evaluate()

### Related code:
- IPC handlers: `src/main/ipc/handlers.ts`
- Type definitions: `src/shared/types.ts:82-96` (RendererApi)
- UI components: `src/renderer/main.tsx:152-166` (App component)
- Status hook: `src/renderer/main.tsx:9-32` (useStatus)
- E2e fixtures: `e2e/fixtures.ts:25` (page fixture)
- Window creation: `src/main/index.ts:21-39`

### Recent changes:
- Migration from flat API to nested API structure (GAP-007) - incomplete
- Domain-based IPC channel naming (`system:`, `updates:`, `config:` prefixes)

### Similar bugs:
- API migration patterns requiring dual exposure during transition
- Electron evaluate() context limitations with require()
- Stream error handling timing issues in Node.js

## Out of Scope
- Refactoring unrelated code outside test failure paths
- Performance optimizations beyond fixing the failures
- Feature enhancements to the update system or UI
- Completing the full GAP-007 API migration (only fix what's needed for tests)
