/**
 * Regression test: autoUpdater restart causes re-download loop
 *
 * Bug report: bug-reports/autoupdater-restart-download-loop.md
 * Related: bug-reports/macos-gatekeeper-warning-unsigned-app.md
 * Fixed: 2025-12-10
 * Root cause: autoUpdater.quitAndInstall() incompatible with autoInstallOnAppQuit=true
 *
 * Protection: Prevents regression where quitAndInstall() causes redundant install attempts
 * leading to download loops and repeated Gatekeeper warnings.
 *
 * This test verifies that:
 * 1. restartToUpdate() uses app.quit() instead of autoUpdater.quitAndInstall()
 * 2. autoInstallOnAppQuit is enabled (requirement from bug 0015)
 * 3. The two mechanisms don't conflict
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('Bug Fix: autoUpdater restart download loop', () => {
  const mainIndexPath = join(__dirname, '..', '..', 'main', 'index.ts');
  const mainIndexContent = readFileSync(mainIndexPath, 'utf-8');

  const controllerPath = join(__dirname, 'controller.ts');
  const controllerContent = readFileSync(controllerPath, 'utf-8');

  test('restartToUpdate() uses app.quit() not quitAndInstall()', () => {
    const restartFunctionMatch = mainIndexContent.match(
      /async function restartToUpdate\(\)[\s\S]*?^}/m
    );

    expect(restartFunctionMatch).toBeTruthy();
    const restartFunction = restartFunctionMatch![0];

    // Extract only the code lines (not comments)
    const codeLines = restartFunction
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('//');
      })
      .join('\n');

    expect(codeLines).toMatch(/app\.quit\(\)/);
    expect(codeLines).not.toMatch(/autoUpdater\.quitAndInstall\(\)/);
  });

  test('autoInstallOnAppQuit is enabled', () => {
    const autoInstalConfigMatch = controllerContent.match(
      /autoUpdater\.autoInstallOnAppQuit\s*=\s*(true|false)/
    );

    expect(autoInstalConfigMatch).toBeTruthy();
    expect(autoInstalConfigMatch![1]).toBe('true');
  });

  test('fix prevents redundant install attempts', () => {
    const restartFunctionMatch = mainIndexContent.match(/async function restartToUpdate\(\)[\s\S]*?^}/m);
    expect(restartFunctionMatch).toBeTruthy();

    const codeLines = restartFunctionMatch![0]
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('//');
      })
      .join('\n');

    expect(codeLines).not.toContain('quitAndInstall()');
  });

  test('has bug fix documentation in code', () => {
    const restartFunctionMatch = mainIndexContent.match(
      /async function restartToUpdate\(\)[\s\S]*?^}/m
    );

    expect(restartFunctionMatch).toBeTruthy();
    const restartFunction = restartFunctionMatch![0];

    expect(restartFunction).toMatch(/BUG FIX/);
    expect(restartFunction).toMatch(/bug-reports\/autoupdater-restart-download-loop\.md/);
    expect(restartFunction).toMatch(/quitAndInstall.*incompatible.*autoInstallOnAppQuit/);
  });
});
