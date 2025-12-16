/**
 * Theme Audit Script
 *
 * Run this to check which themes pass WCAG validation.
 * Usage: npx ts-node src/renderer/themes/generator/audit.ts
 */

import { ThemeGenerator, formatValidationResult } from './index';
import { THEME_PRESETS } from '../presets';

console.log('Theme Generation Audit');
console.log('='.repeat(60));
console.log();

const audit = ThemeGenerator.audit(THEME_PRESETS);

console.log(`Total themes: ${THEME_PRESETS.length}`);
console.log(`Passed: ${audit.passed.length}`);
console.log(`Failed: ${audit.failed.length}`);
console.log(`Warnings: ${audit.warnings.length}`);
console.log();

if (audit.passed.length > 0) {
  console.log('PASSED THEMES:');
  for (const id of audit.passed) {
    console.log(`  ✓ ${id}`);
  }
  console.log();
}

if (audit.warnings.length > 0) {
  console.log('THEMES WITH WARNINGS:');
  for (const { id, warnings } of audit.warnings) {
    console.log(`  ⚠ ${id}:`);
    for (const warning of warnings) {
      console.log(`      ${warning}`);
    }
  }
  console.log();
}

if (audit.failed.length > 0) {
  console.log('FAILED THEMES:');
  for (const { id, errors } of audit.failed) {
    console.log(`  ✗ ${id}:`);
    for (const error of errors) {
      console.log(`      ${error}`);
    }
  }
  console.log();
}

console.log('='.repeat(60));
console.log(
  audit.failed.length === 0
    ? 'All themes passed validation!'
    : `${audit.failed.length} theme(s) need attention.`
);
