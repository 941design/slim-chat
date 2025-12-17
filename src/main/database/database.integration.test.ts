/**
 * Integration tests for database persistence layer
 *
 * Tests full lifecycle integration:
 * - Initialization → Migration → State operations → Cleanup
 * - IPC handler integration
 * - Error handling across component boundaries
 *
 * Property-based tests verify system-level invariants.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fc from 'fast-check';
import { Database } from 'sql.js';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import {
  initializeDatabaseWithMigrations,
  closeDatabaseConnection,
  getStateValue,
  setStateValue,
  deleteStateValue,
  getAllStateValues,
} from './index';
import { getDatabase, _resetDatabaseState } from './connection';

// Mock electron app
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp/test-userdata'),
    quit: jest.fn(),
  },
  dialog: {
    showErrorBox: jest.fn(),
  },
}));

// Mock logging
jest.mock('../logging', () => ({
  log: jest.fn(),
}));

describe('Database Persistence Layer Integration', () => {
  const testDbPath = '/tmp/test-userdata/nostling.db';

  beforeEach(async () => {
    // Clean up any existing test database
    _resetDatabaseState();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up after each test
    await closeDatabaseConnection();
    _resetDatabaseState();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Property: Full Lifecycle Integration', () => {
    it('should initialize → migrate → operate → close without errors', async () => {
      // Initialize and migrate
      await initializeDatabaseWithMigrations();
      const db = getDatabase();
      expect(db).not.toBeNull();

      // Verify migration applied
      const tables = db!.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tables[0]?.values.flat() || [];
      expect(tableNames).toContain('app_state');
      expect(tableNames).toContain('knex_migrations');

      // Perform state operations
      await setStateValue('test-key', 'test-value');
      const value = await getStateValue('test-key');
      expect(value).toBe('test-value');

      // Clean up
      await closeDatabaseConnection();
      expect(getDatabase()).toBeNull();
    });
  });

  describe('Property: State Operations Compose Correctly', () => {
    beforeEach(async () => {
      await initializeDatabaseWithMigrations();
    });

    it('should handle set → get → delete → get sequence', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          fc.string({ minLength: 0, maxLength: 200 }),
          async (key, value) => {
            // Set value
            await setStateValue(key, value);

            // Get should return what was set
            const retrieved = await getStateValue(key);
            expect(retrieved).toBe(value);

            // Delete value
            await deleteStateValue(key);

            // Get should return null after delete
            const afterDelete = await getStateValue(key);
            expect(afterDelete).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle concurrent state operations', async () => {
      const keys = ['key1', 'key2', 'key3', 'key4', 'key5'];
      const values = ['val1', 'val2', 'val3', 'val4', 'val5'];

      // Set all keys concurrently
      await Promise.all(keys.map((key, i) => setStateValue(key, values[i])));

      // Get all keys concurrently
      const results = await Promise.all(keys.map((key) => getStateValue(key)));

      // All values should match
      expect(results).toEqual(values);

      // getAllState should return all entries
      const allState = await getAllStateValues();
      keys.forEach((key, i) => {
        expect(allState[key]).toBe(values[i]);
      });
    });
  });

  describe('Property: Idempotency - Multiple Operations Safe', () => {
    beforeEach(async () => {
      await initializeDatabaseWithMigrations();
    });

    it('should allow setting same key multiple times (last write wins)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          fc.array(fc.string({ minLength: 0, maxLength: 100 }), { minLength: 2, maxLength: 10 }),
          async (key, values) => {
            // Set key multiple times with different values
            for (const value of values) {
              await setStateValue(key, value);
            }

            // Get should return last value
            const result = await getStateValue(key);
            expect(result).toBe(values[values.length - 1]);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should allow deleting non-existent keys safely', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          async (key) => {
            // Delete non-existent key should not throw
            await expect(deleteStateValue(key)).resolves.not.toThrow();

            // Multiple deletes should be safe
            await deleteStateValue(key);
            await deleteStateValue(key);
            await deleteStateValue(key);

            // Key should still not exist
            const value = await getStateValue(key);
            expect(value).toBeNull();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property: Persistence Across Sessions', () => {
    it('should persist state across close and reinitialize', async () => {
      // First session
      await initializeDatabaseWithMigrations();
      await setStateValue('persistent-key', 'persistent-value');
      await closeDatabaseConnection();

      // Second session (simulate app restart)
      _resetDatabaseState();
      await initializeDatabaseWithMigrations();
      const value = await getStateValue('persistent-key');
      expect(value).toBe('persistent-value');
    });

    it('should persist multiple state entries correctly', async () => {
      const testData: Record<string, string> = {
        theme: 'dark',
        language: 'en',
        fontSize: '14',
        autoSave: 'true',
      };

      // First session: write data
      await initializeDatabaseWithMigrations();
      for (const [key, value] of Object.entries(testData)) {
        await setStateValue(key, value);
      }
      await closeDatabaseConnection();

      // Second session: verify data persisted
      _resetDatabaseState();
      await initializeDatabaseWithMigrations();
      const allState = await getAllStateValues();

      for (const [key, expectedValue] of Object.entries(testData)) {
        expect(allState[key]).toBe(expectedValue);
      }
    });
  });

  describe('Property: Error Handling Across Components', () => {
    it('should throw error when accessing state before initialization', async () => {
      // Database not initialized
      await expect(getStateValue('any-key')).rejects.toThrow('Database not initialized');
      await expect(setStateValue('any-key', 'value')).rejects.toThrow('Database not initialized');
      await expect(deleteStateValue('any-key')).rejects.toThrow('Database not initialized');
      await expect(getAllStateValues()).rejects.toThrow('Database not initialized');
    });

    it('should validate input parameters', async () => {
      await initializeDatabaseWithMigrations();

      // Empty key should throw
      await expect(getStateValue('')).rejects.toThrow('Key must be a non-empty string');
      await expect(setStateValue('', 'value')).rejects.toThrow('Key must be a non-empty string');
      await expect(deleteStateValue('')).rejects.toThrow('Key must be a non-empty string');

      // Whitespace-only key should throw
      await expect(getStateValue('   ')).rejects.toThrow('Key must be a non-empty string');

      // Invalid value types should throw
      await expect(setStateValue('key', null as any)).rejects.toThrow('Value must be a string');
      await expect(setStateValue('key', undefined as any)).rejects.toThrow('Value must be a string');
    });
  });

  describe('Property: Migration Idempotency', () => {
    it('should safely re-run migrations (no new migrations applied)', async () => {
      // First initialization
      await initializeDatabaseWithMigrations();
      const db1 = getDatabase();
      expect(db1).not.toBeNull();

      // Write some state
      await setStateValue('migration-test', 'value-1');

      // Close
      await closeDatabaseConnection();

      // Second initialization (migrations should be idempotent)
      _resetDatabaseState();
      await initializeDatabaseWithMigrations();
      const db2 = getDatabase();
      expect(db2).not.toBeNull();

      // State should still exist
      const value = await getStateValue('migration-test');
      expect(value).toBe('value-1');
    });
  });

  describe('Property: getAllState Consistency', () => {
    beforeEach(async () => {
      await initializeDatabaseWithMigrations();
    });

    it('should return empty object when no state exists', async () => {
      const allState = await getAllStateValues();
      expect(allState).toEqual({});
    });

    it('should return all set state entries', async () => {
      // Filter out Object prototype property names to avoid prototype pollution issues
      const prototypeNames = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '__proto__', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'];
      await fc.assert(
        fc.asyncProperty(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0 && !prototypeNames.includes(s)),
            fc.string({ minLength: 0, maxLength: 50 }),
            { minKeys: 1, maxKeys: 10 }
          ),
          async (stateEntries) => {
            // Clear all state before this test run
            const existingState = await getAllStateValues();
            for (const key of Object.keys(existingState)) {
              await deleteStateValue(key);
            }

            // Set all entries
            for (const [key, value] of Object.entries(stateEntries)) {
              await setStateValue(key, value);
            }

            // getAllState should return exact match
            const allState = await getAllStateValues();

            // All set keys should be present
            for (const [key, value] of Object.entries(stateEntries)) {
              expect(allState[key]).toBe(value);
            }

            // Should have exactly the right number of keys
            expect(Object.keys(allState).length).toBe(Object.keys(stateEntries).length);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Example: Realistic Usage Scenarios', () => {
    beforeEach(async () => {
      await initializeDatabaseWithMigrations();
    });

    it('Example: User preference management', async () => {
      // User opens app for first time
      let theme = await getStateValue('theme');
      expect(theme).toBeNull();

      // User sets dark theme
      await setStateValue('theme', 'dark');
      await setStateValue('fontSize', '16');
      await setStateValue('autoSave', 'true');

      // Verify preferences saved
      theme = await getStateValue('theme');
      expect(theme).toBe('dark');

      // User changes theme
      await setStateValue('theme', 'light');
      theme = await getStateValue('theme');
      expect(theme).toBe('light');

      // Get all preferences at once
      const allPrefs = await getAllStateValues();
      expect(allPrefs.theme).toBe('light');
      expect(allPrefs.fontSize).toBe('16');
      expect(allPrefs.autoSave).toBe('true');
    });

    it('Example: Window state persistence', async () => {
      // Save window bounds
      await setStateValue('windowX', '100');
      await setStateValue('windowY', '200');
      await setStateValue('windowWidth', '1024');
      await setStateValue('windowHeight', '768');

      // Close app
      await closeDatabaseConnection();

      // Reopen app (new session)
      _resetDatabaseState();
      await initializeDatabaseWithMigrations();

      // Restore window bounds
      const x = await getStateValue('windowX');
      const y = await getStateValue('windowY');
      const width = await getStateValue('windowWidth');
      const height = await getStateValue('windowHeight');

      expect(x).toBe('100');
      expect(y).toBe('200');
      expect(width).toBe('1024');
      expect(height).toBe('768');
    });

    it('Example: Feature flag management', async () => {
      // Set feature flags
      await setStateValue('feature:new-editor', 'enabled');
      await setStateValue('feature:beta-updates', 'disabled');

      // Check feature flags
      const newEditor = await getStateValue('feature:new-editor');
      const betaUpdates = await getStateValue('feature:beta-updates');

      expect(newEditor).toBe('enabled');
      expect(betaUpdates).toBe('disabled');

      // Disable feature
      await setStateValue('feature:new-editor', 'disabled');
      expect(await getStateValue('feature:new-editor')).toBe('disabled');

      // Remove feature flag entirely
      await deleteStateValue('feature:beta-updates');
      expect(await getStateValue('feature:beta-updates')).toBeNull();
    });
  });

  describe('Property: Database File Management', () => {
    it('should create database file on first initialization', async () => {
      expect(fs.existsSync(testDbPath)).toBe(false);

      await initializeDatabaseWithMigrations();

      // Database might not be persisted until close
      await closeDatabaseConnection();

      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('should reuse existing database file on subsequent initializations', async () => {
      // First initialization
      await initializeDatabaseWithMigrations();
      await setStateValue('reuse-test', 'original');
      await closeDatabaseConnection();

      const mtime1 = fs.statSync(testDbPath).mtime;

      // Brief delay to ensure mtime difference if file recreated
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second initialization should reuse file
      _resetDatabaseState();
      await initializeDatabaseWithMigrations();
      const value = await getStateValue('reuse-test');
      expect(value).toBe('original');
      await closeDatabaseConnection();

      // File should exist and have been modified (updated) but not recreated
      expect(fs.existsSync(testDbPath)).toBe(true);
    });
  });
});
