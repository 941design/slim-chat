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

    // VERIFY FIX PART 2: Create-release job should generate manifest
    const releaseSteps = createReleaseJob.steps.map((step: { name: string }) => step.name);
    const manifestInRelease = releaseSteps.some((name: string) =>
      name.toLowerCase().includes('manifest')
    );

    expect(manifestInRelease).toBe(true);

    // VERIFY FIX PART 3: Manifest step comes AFTER artifact download
    const downloadIndex = releaseSteps.indexOf('Download all artifacts');
    const consolidateIndex = releaseSteps.indexOf('Consolidate artifacts for manifest generation');
    const manifestIndex = releaseSteps.indexOf('Generate manifest with all platform artifacts');

    expect(downloadIndex).toBeGreaterThan(-1);
    expect(consolidateIndex).toBeGreaterThan(-1);
    expect(manifestIndex).toBeGreaterThan(-1);
    expect(consolidateIndex).toBeGreaterThan(downloadIndex);
    expect(manifestIndex).toBeGreaterThan(consolidateIndex);

    // VERIFY FIX PART 4: NOSTLING_RSA_PRIVATE_KEY available in create-release job
    expect(createReleaseJob.env).toBeDefined();
    expect(createReleaseJob.env.NOSTLING_RSA_PRIVATE_KEY).toBeDefined();
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
  });

});
