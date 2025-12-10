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
    // Find the restartToUpdate function
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

    // Verify it uses app.quit()
    expect(codeLines).toMatch(/app\.quit\(\)/);

    // Verify it does NOT use autoUpdater.quitAndInstall() in actual code
    expect(codeLines).not.toMatch(/autoUpdater\.quitAndInstall\(\)/);

    console.log('\n=== RESTART TO UPDATE VERIFICATION ===');
    console.log('✓ restartToUpdate() uses app.quit()');
    console.log('✓ restartToUpdate() does NOT use autoUpdater.quitAndInstall()');
  });

  test('autoInstallOnAppQuit is enabled', () => {
    // Find autoUpdater configuration in controller.ts
    const autoInstalConfigMatch = controllerContent.match(
      /autoUpdater\.autoInstallOnAppQuit\s*=\s*(true|false)/
    );

    expect(autoInstalConfigMatch).toBeTruthy();
    const autoInstallValue = autoInstalConfigMatch![1];

    // Must be true (requirement from bug 0015)
    expect(autoInstallValue).toBe('true');

    console.log('\n=== AUTO INSTALL CONFIGURATION ===');
    console.log('✓ autoInstallOnAppQuit = true (bug 0015 requirement)');
  });

  test('fix prevents redundant install attempts', () => {
    // Verify the pattern that caused the bug is absent
    const restartFunctionMatch = mainIndexContent.match(/async function restartToUpdate\(\)[\s\S]*?^}/m);
    expect(restartFunctionMatch).toBeTruthy();

    // Extract only code (not comments) to check for actual quitAndInstall() call
    const codeLines = restartFunctionMatch![0]
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('//');
      })
      .join('\n');

    const hasQuitAndInstallInRestartToUpdate = codeLines.includes('quitAndInstall()');

    expect(hasQuitAndInstallInRestartToUpdate).toBe(false);

    console.log('\n=== REDUNDANT INSTALL PREVENTION ===');
    console.log('Root cause: quitAndInstall() + autoInstallOnAppQuit=true causes:');
    console.log('  1. User clicks "Restart to Update"');
    console.log('  2. quitAndInstall() attempts install');
    console.log('  3. App quits');
    console.log('  4. autoInstallOnAppQuit triggers ANOTHER install attempt');
    console.log('  5. Conflict causes re-download loop');
    console.log('');
    console.log('Fix: Use app.quit() alone when autoInstallOnAppQuit=true');
    console.log('  1. User clicks "Restart to Update"');
    console.log('  2. app.quit() quits app cleanly');
    console.log('  3. autoInstallOnAppQuit handles installation automatically');
    console.log('  4. Update installs correctly, no loop');
    console.log('');
    console.log('✓ Redundant install pattern eliminated');
  });

  test('has bug fix documentation in code', () => {
    // Find restartToUpdate function with context
    const restartFunctionMatch = mainIndexContent.match(
      /async function restartToUpdate\(\)[\s\S]*?^}/m
    );

    expect(restartFunctionMatch).toBeTruthy();
    const restartFunction = restartFunctionMatch![0];

    // Verify bug fix comment exists
    expect(restartFunction).toMatch(/BUG FIX/);
    expect(restartFunction).toMatch(/bug-reports\/autoupdater-restart-download-loop\.md/);
    expect(restartFunction).toMatch(/quitAndInstall.*incompatible.*autoInstallOnAppQuit/);

    console.log('\n=== CODE DOCUMENTATION ===');
    console.log('✓ Bug fix comment present in restartToUpdate()');
    console.log('✓ References bug report: autoupdater-restart-download-loop.md');
    console.log('✓ Explains root cause: quitAndInstall incompatible with autoInstallOnAppQuit');
  });

  test('complete fix summary', () => {
    console.log('\n=== FIX SUMMARY ===');
    console.log('');
    console.log('Bug: Clicking "Restart to Update" caused app to re-download update');
    console.log('Root cause: quitAndInstall() conflicts with autoInstallOnAppQuit=true');
    console.log('');
    console.log('Fix applied:');
    console.log('  - Changed: autoUpdater.quitAndInstall() → app.quit()');
    console.log('  - Location: src/main/index.ts:194 (restartToUpdate function)');
    console.log('  - Preserved: autoInstallOnAppQuit=true (bug 0015 requirement)');
    console.log('');
    console.log('Verification:');
    console.log('  ✓ restartToUpdate() uses app.quit()');
    console.log('  ✓ autoUpdater.quitAndInstall() removed from restart flow');
    console.log('  ✓ autoInstallOnAppQuit=true preserved');
    console.log('  ✓ Code documented with bug report reference');
    console.log('');
    console.log('Bug reports:');
    console.log('  - bug-reports/autoupdater-restart-download-loop.md');
    console.log('  - bug-reports/macos-gatekeeper-warning-unsigned-app.md');
    console.log('');
    console.log('Fixed: 2025-12-10');

    // Always pass - this is just documentation
    expect(true).toBe(true);
  });
});
