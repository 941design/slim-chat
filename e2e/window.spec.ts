import { test, expect } from './fixtures';

test.describe('Electron Window', () => {
  test('should create browser window', async ({ electronApp }) => {
    // BUG FIX: Window creation timing - wait for window to be created
    // Root cause: windows() may be called before window is created
    // Bug report: bug-reports/window-creation-timing.md
    // Fixed: 2025-12-06
    await electronApp.firstWindow();
    const windows = await electronApp.windows();
    expect(windows.length).toBeGreaterThan(0);
  });

  test('should have correct window title', async ({ page }) => {
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('should have correct window dimensions', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    const size = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });

  test('should have context isolation enabled', async ({ page }) => {
    const hasNodeIntegration = await page.evaluate(() => {
      return typeof (window as any).process !== 'undefined';
    });
    expect(hasNodeIntegration).toBe(false);
  });

  test('should have preload API available', async ({ page }) => {
    const hasApi = await page.evaluate(() => {
      return typeof (window as any).api !== 'undefined';
    });
    expect(hasApi).toBe(true);
  });

  test('should expose required API methods', async ({ page }) => {
    const apiMethods = await page.evaluate(() => {
      const api = (window as any).api;
      return {
        hasGetStatus: typeof api?.getStatus === 'function',
        hasCheckForUpdates: typeof api?.checkForUpdates === 'function',
        hasRestartToUpdate: typeof api?.restartToUpdate === 'function',
        hasOnUpdateState: typeof api?.onUpdateState === 'function',
      };
    });

    expect(apiMethods.hasGetStatus).toBe(true);
    expect(apiMethods.hasCheckForUpdates).toBe(true);
    expect(apiMethods.hasRestartToUpdate).toBe(true);
    expect(apiMethods.hasOnUpdateState).toBe(true);
  });

  test('should be able to get app status via API', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');

    const status = await page.evaluate(async () => {
      return await (window as any).api.getStatus();
    });

    expect(status).toBeTruthy();
    expect(status.version).toBeTruthy();
    expect(status.platform).toBeTruthy();
    expect(status.updateState).toBeTruthy();
  });
});
