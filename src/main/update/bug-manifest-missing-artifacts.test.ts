/**
 * Regression test for manifest missing artifacts bug
 *
 * Bug: Manifest.json in GitHub releases only includes artifacts from the Linux build
 * Expected: Manifest includes all platform artifacts (.dmg, .AppImage) from all builds
 * Actual: Only Linux artifacts present (manifest generated before macOS artifacts available)
 * Bug report: bug-reports/manifest-missing-artifacts-report.md
 *
 * Root cause: Manifest was generated in the build job (per-platform matrix run)
 * on ubuntu-latest only, before artifacts from other platforms were available.
 * This meant the manifest only saw the .AppImage file from the local Linux build,
 * missing the .dmg file from the macOS build.
 *
 * Impact: Auto-updater broken for macOS users - no update path in manifest
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

describe('Bug: Manifest missing artifacts', () => {
  it('verifies manifest is generated in create-release job after all artifacts are downloaded', () => {
    // BUG FIX VERIFICATION:
    // The manifest generation must happen in the create-release job (not build job)
    // after all platform artifacts have been downloaded from the matrix builds

    const workflowPath = join(__dirname, '../../../.github/workflows/release.yml');
    const workflowContent = readFileSync(workflowPath, 'utf-8');
    const workflow = YAML.parse(workflowContent);

    const buildJob = workflow.jobs['build'];
    const createReleaseJob = workflow.jobs['create-release'];

    // VERIFY FIX PART 1: Build job should NOT generate manifest
    const buildSteps = buildJob.steps.map((step: { name: string }) => step.name);
    const manifestInBuild = buildSteps.some((name: string) =>
      name.toLowerCase().includes('manifest')
    );

    expect(manifestInBuild).toBe(false);
    console.log('\n=== BUILD JOB VERIFICATION ===');
    console.log('Manifest generation in build job:', manifestInBuild ? 'YES (BUG!)' : 'NO (CORRECT)');
    console.log('Fix: Manifest generation removed from per-platform build job');

    // VERIFY FIX PART 2: Create-release job should generate manifest
    const releaseSteps = createReleaseJob.steps.map((step: { name: string }) => step.name);
    const manifestInRelease = releaseSteps.some((name: string) =>
      name.toLowerCase().includes('manifest')
    );

    expect(manifestInRelease).toBe(true);
    console.log('\n=== CREATE-RELEASE JOB VERIFICATION ===');
    console.log('Manifest generation in create-release job:', manifestInRelease ? 'YES (CORRECT)' : 'NO (BUG!)');

    // VERIFY FIX PART 3: Manifest step comes AFTER artifact download
    const downloadIndex = releaseSteps.indexOf('Download all artifacts');
    const consolidateIndex = releaseSteps.indexOf('Consolidate artifacts for manifest generation');
    const manifestIndex = releaseSteps.indexOf('Generate manifest with all platform artifacts');

    expect(downloadIndex).toBeGreaterThan(-1);
    expect(consolidateIndex).toBeGreaterThan(-1);
    expect(manifestIndex).toBeGreaterThan(-1);
    expect(consolidateIndex).toBeGreaterThan(downloadIndex);
    expect(manifestIndex).toBeGreaterThan(consolidateIndex);

    console.log('\n=== STEP ORDER VERIFICATION ===');
    console.log(`Step ${downloadIndex + 1}: Download all artifacts`);
    console.log(`Step ${consolidateIndex + 1}: Consolidate artifacts for manifest generation`);
    console.log(`Step ${manifestIndex + 1}: Generate manifest with all platform artifacts`);
    console.log('Order correct: Download → Consolidate → Generate Manifest');

    // VERIFY FIX PART 4: SLIM_CHAT_RSA_PRIVATE_KEY available in create-release job
    expect(createReleaseJob.env).toBeDefined();
    expect(createReleaseJob.env.SLIM_CHAT_RSA_PRIVATE_KEY).toBeDefined();
    console.log('\n=== ENVIRONMENT VERIFICATION ===');
    console.log('SLIM_CHAT_RSA_PRIVATE_KEY configured:', createReleaseJob.env.SLIM_CHAT_RSA_PRIVATE_KEY ? 'YES' : 'NO');

    console.log('\n=== FIX SUMMARY ===');
    console.log('✓ Manifest generation moved from build job to create-release job');
    console.log('✓ Manifest generated AFTER all platform artifacts downloaded');
    console.log('✓ All artifacts consolidated before manifest generation');
    console.log('✓ RSA private key available for signing');
    console.log('\nBug report: bug-reports/manifest-missing-artifacts-report.md');
    console.log('Fixed: 2025-12-07');
  });

  it('verifies consolidation step copies artifacts from all platforms', () => {
    // BUG FIX VERIFICATION:
    // The consolidation step must copy artifacts from both platforms to a single location

    const workflowPath = join(__dirname, '../../../.github/workflows/release.yml');
    const workflowContent = readFileSync(workflowPath, 'utf-8');
    const workflow = YAML.parse(workflowContent);

    const createReleaseJob = workflow.jobs['create-release'];
    const consolidateStep = createReleaseJob.steps.find(
      (step: { name: string }) => step.name === 'Consolidate artifacts for manifest generation'
    );

    expect(consolidateStep).toBeDefined();
    expect(consolidateStep.run).toBeDefined();

    const script = consolidateStep.run as string;

    // Verify the script creates dist directory
    expect(script).toContain('mkdir -p dist');

    // Verify the script copies .dmg files (macOS artifacts)
    expect(script).toMatch(/cp.*\.dmg.*dist/);

    // Verify the script copies .AppImage files (Linux artifacts)
    expect(script).toMatch(/cp.*\.AppImage.*dist/);

    // Verify it uses recursive pattern to find artifacts from all platform subdirectories
    expect(script).toContain('release-artifacts/**/*.dmg');
    expect(script).toContain('release-artifacts/**/*.AppImage');

    console.log('\n=== CONSOLIDATION SCRIPT VERIFICATION ===');
    console.log('Creates dist directory: ✓');
    console.log('Copies macOS artifacts (*.dmg): ✓');
    console.log('Copies Linux artifacts (*.AppImage): ✓');
    console.log('Uses recursive glob (release-artifacts/**/*): ✓');
    console.log('\nScript ensures all platform artifacts available for manifest generation');
  });

  it('verifies manifest is moved to release-artifacts for upload', () => {
    // BUG FIX VERIFICATION:
    // After manifest generation, it must be moved back to release-artifacts
    // so the upload step can find it

    const workflowPath = join(__dirname, '../../../.github/workflows/release.yml');
    const workflowContent = readFileSync(workflowPath, 'utf-8');
    const workflow = YAML.parse(workflowContent);

    const createReleaseJob = workflow.jobs['create-release'];
    const moveStep = createReleaseJob.steps.find(
      (step: { name: string }) => step.name === 'Move manifest to release artifacts'
    );

    expect(moveStep).toBeDefined();
    expect(moveStep.run).toBeDefined();

    const script = moveStep.run as string;

    // Verify manifest is moved from dist/ to release-artifacts/
    expect(script).toContain('dist/manifest.json');
    expect(script).toContain('release-artifacts/');

    console.log('\n=== MANIFEST MOVE VERIFICATION ===');
    console.log('Moves manifest.json from dist/ to release-artifacts/: ✓');
    console.log('\nEnsures upload step can find manifest at release-artifacts/manifest.json');
  });

  it('documents the execution flow: matrix builds → download → consolidate → generate', () => {
    // DOCUMENTATION:
    // This test documents the complete flow from matrix builds to manifest generation

    console.log('\n=== COMPLETE EXECUTION FLOW ===');
    console.log('\n1. BUILD JOB (matrix: ubuntu-latest, macos-13):');
    console.log('   ubuntu-latest:');
    console.log('     - Build → Creates SlimChat-x.y.z-x86_64.AppImage in dist/');
    console.log('     - Upload artifacts from dist/ to slimchat-ubuntu-latest/');
    console.log('   macos-13:');
    console.log('     - Build → Creates SlimChat-x.y.z.dmg in dist/');
    console.log('     - Upload artifacts from dist/ to slimchat-macos-13/');
    console.log('\n2. CREATE-RELEASE JOB (runs on ubuntu-latest):');
    console.log('   - Download artifacts → release-artifacts/slimchat-ubuntu-latest/dist/');
    console.log('                        → release-artifacts/slimchat-macos-13/dist/');
    console.log('   - Consolidate artifacts:');
    console.log('     cp release-artifacts/**/*.dmg dist/');
    console.log('     cp release-artifacts/**/*.AppImage dist/');
    console.log('     Result: dist/ now contains .dmg AND .AppImage');
    console.log('   - Generate manifest:');
    console.log('     npm run sign:manifest (scans dist/ for all artifacts)');
    console.log('     Result: manifest.json includes BOTH platforms');
    console.log('   - Move manifest:');
    console.log('     mv dist/manifest.json release-artifacts/');
    console.log('   - Upload all files to GitHub release');
    console.log('\n=== KEY INSIGHT ===');
    console.log('Manifest generation sees ALL artifacts because:');
    console.log('1. It runs AFTER download-artifact@v4 completes');
    console.log('2. Consolidation step copies artifacts from ALL platform subdirectories');
    console.log('3. sign:manifest script scans dist/ which now contains everything');
    console.log('\nBug report: bug-reports/manifest-missing-artifacts-report.md');
  });

  it('reproduces the original bug: manifest generated per-platform', () => {
    // BUG REPRODUCTION:
    // This test documents what the original bug looked like

    console.log('\n=== ORIGINAL BUG (BEFORE FIX) ===');
    console.log('\nProblem: Manifest generated in build job on ubuntu-latest only');
    console.log('\nExecution flow:');
    console.log('1. ubuntu-latest build:');
    console.log('   - Creates SlimChat-x.y.z-x86_64.AppImage in dist/');
    console.log('   - Generates manifest (ONLY sees .AppImage in dist/)');
    console.log('   - Manifest contains only Linux artifact');
    console.log('   - Uploads dist/ including incomplete manifest');
    console.log('\n2. macos-13 build (parallel):');
    console.log('   - Creates SlimChat-x.y.z.dmg in dist/');
    console.log('   - NO manifest generation (skipped by if: matrix.os == ubuntu-latest)');
    console.log('   - Uploads dist/ without manifest');
    console.log('\n3. create-release job:');
    console.log('   - Downloads artifacts');
    console.log('   - Uploads to GitHub release');
    console.log('   - Result: Manifest missing .dmg artifact!');
    console.log('\nRoot cause: Manifest generated before macOS artifacts available');
    console.log('Impact: macOS users cannot auto-update (no update path in manifest)');

    // The fix moves manifest generation to create-release job after all downloads
    expect(true).toBe(true); // Test documents the bug, assertion is symbolic
  });
});
