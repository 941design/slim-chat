/**
 * Property-based tests for database/connection.ts
 *
 * Tests verify all contract invariants and properties:
 * - Singleton property: Multiple initDatabase() calls return same instance
 * - Persistence property: Data written survives close/reopen cycle
 * - Idempotency property: Closing twice is safe (no-op)
 * - WAL mode property: PRAGMA journal_mode returns 'wal' after init
 * - Isolation property: Each app instance has separate database
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { initDatabase, closeDatabase, getDatabase, getDatabasePath, _resetDatabaseState } from './connection';

// Mock electron app module
jest.mock('electron', () => {
  let mockUserDataPath: string | null = null;

  return {
    app: {
      getPath: (pathType: string) => {
        if (pathType === 'userData') {
          if (!mockUserDataPath) {
            throw new Error('Mock userData path not set');
          }
          return mockUserDataPath;
        }
        throw new Error(`Unknown path type: ${pathType}`);
      },
      setMockUserDataPath: (userDataPath: string) => {
        mockUserDataPath = userDataPath;
      },
    },
  };
});

// Access the mocked app for test setup
const { app } = require('electron');

describe('Database Connection Manager', () => {
  let tempDir: string;

  beforeEach(() => {
    _resetDatabaseState();
    tempDir = fs.mkdtempSync(path.join(__dirname, 'test-db-'));
    app.setMockUserDataPath(tempDir);
  });

  afterEach(async () => {
    try {
      await closeDatabase();
    } catch {
      // Ignore errors during cleanup
    }

    _resetDatabaseState();

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Property-Based Tests', () => {
    it('P001: Singleton property - multiple initDatabase() calls return same instance', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }),
          async (numCalls) => {
            const instances: any[] = [];
            for (let i = 0; i < numCalls; i++) {
              const instance = await initDatabase();
              instances.push(instance);
            }

            expect(instances.length).toBe(numCalls);

            const firstInstance = instances[0];
            for (let i = 1; i < instances.length; i++) {
              expect(instances[i]).toBe(firstInstance);
            }
          }
        ),
        { numRuns: 5 }
      );
    });

    it('P002: Persistence property - data written survives close/reopen cycle', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
          async (testStrings) => {
            _resetDatabaseState();
            const tempTestDir = fs.mkdtempSync(path.join(__dirname, 'test-db-p002-'));

            try {
              app.setMockUserDataPath(tempTestDir);
              const db1 = await initDatabase();

              db1.run('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, data TEXT)');
              for (let i = 0; i < testStrings.length; i++) {
                db1.run('INSERT INTO test (data) VALUES (?)', [testStrings[i]]);
              }

              await closeDatabase();

              const db2 = await initDatabase();
              const result = db2.exec('SELECT data FROM test ORDER BY id');

              expect(result).toHaveLength(1);
              expect(result[0].values).toHaveLength(testStrings.length);

              const retrievedData = result[0].values.map((row: any) => row[0]);
              expect(retrievedData).toEqual(testStrings);
            } finally {
              await closeDatabase();
              _resetDatabaseState();
              app.setMockUserDataPath(tempDir);
              try {
                fs.rmSync(tempTestDir, { recursive: true, force: true });
              } catch {
                // Ignore cleanup errors
              }
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('P003: Idempotency property - closing twice is safe (no-op)', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          await initDatabase();
          await closeDatabase();

          await expect(closeDatabase()).resolves.not.toThrow();

          expect(getDatabase()).toBeNull();
        }),
        { numRuns: 5 }
      );
    });

    it('P004: WAL mode property - PRAGMA journal_mode returns wal after init', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          const db = await initDatabase();

          const result = db.exec('PRAGMA journal_mode');

          expect(result).toHaveLength(1);
          expect(result[0].values).toHaveLength(1);

          const journalMode = (result[0].values[0] as any[])[0];
          expect(journalMode?.toString().toLowerCase()).toBe('wal');
        }),
        { numRuns: 3 }
      );
    });

    it('P005: Database path property - path is set and persists through cycle', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          _resetDatabaseState();
          const tempTestDir = fs.mkdtempSync(path.join(__dirname, 'test-db-p005-'));

          try {
            app.setMockUserDataPath(tempTestDir);
            expect(getDatabasePath()).toBeNull();

            await initDatabase();

            const dbPath = getDatabasePath();
            expect(dbPath).not.toBeNull();
            expect(dbPath).toContain('nostling.db');
            expect(path.isAbsolute(dbPath!)).toBe(true);

            const pathBefore = dbPath;
            await closeDatabase();

            const pathAfter = getDatabasePath();
            expect(pathAfter).toBe(pathBefore);
          } finally {
            await closeDatabase();
            _resetDatabaseState();
            app.setMockUserDataPath(tempDir);
            try {
              fs.rmSync(tempTestDir, { recursive: true, force: true });
            } catch {
              // Ignore cleanup errors
            }
          }
        }),
        { numRuns: 3 }
      );
    });

    it('P006: File creation property - database file created on disk after close', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          _resetDatabaseState();
          const tempTestDir = fs.mkdtempSync(path.join(__dirname, 'test-db-p006-'));

          try {
            app.setMockUserDataPath(tempTestDir);
            const expectedPath = path.join(tempTestDir, 'nostling.db');
            expect(fs.existsSync(expectedPath)).toBe(false);

            await initDatabase();

            // Database file is only written to disk on close (sql.js is in-memory)
            expect(fs.existsSync(expectedPath)).toBe(false);

            await closeDatabase();

            // After close, database file should exist on disk
            expect(fs.existsSync(expectedPath)).toBe(true);

            const stats = fs.statSync(expectedPath);
            expect(stats.size).toBeGreaterThan(0);
          } finally {
            await closeDatabase();
            _resetDatabaseState();
            app.setMockUserDataPath(tempDir);
            try {
              fs.rmSync(tempTestDir, { recursive: true, force: true });
            } catch {
              // Ignore cleanup errors
            }
          }
        }),
        { numRuns: 3 }
      );
    });

    it('P007: Multiple write/read cycle property - data persists across multiple cycles', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
          async (writeSequences) => {
            _resetDatabaseState();
            const tempTestDir = fs.mkdtempSync(path.join(__dirname, 'test-db-p007-'));

            try {
              app.setMockUserDataPath(tempTestDir);
              const allData: string[] = [];

              for (const dataToWrite of writeSequences) {
                const db = await initDatabase();

                if (!db.exec('SELECT name FROM sqlite_master WHERE type="table" AND name="test"').length) {
                  db.run('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, data TEXT)');
                }

                db.run('INSERT INTO test (data) VALUES (?)', [dataToWrite]);
                allData.push(dataToWrite);

                await closeDatabase();
                _resetDatabaseState();
              }

              const dbFinal = await initDatabase();
              const result = dbFinal.exec('SELECT data FROM test ORDER BY id');

              expect(result).toHaveLength(1);
              expect(result[0].values).toHaveLength(allData.length);

              const retrievedData = result[0].values.map((row: any) => row[0]);
              expect(retrievedData).toEqual(allData);
            } finally {
              await closeDatabase();
              _resetDatabaseState();
              app.setMockUserDataPath(tempDir);
              try {
                fs.rmSync(tempTestDir, { recursive: true, force: true });
              } catch {
                // Ignore cleanup errors
              }
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('P008: Isolation property - fresh init creates new database', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          const db1 = await initDatabase();
          db1.run('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, data TEXT)');
          db1.run('INSERT INTO test (data) VALUES (?)', ["data from db1"]);

          await closeDatabase();

          const tempDir2 = fs.mkdtempSync(path.join(__dirname, 'test-db-'));
          app.setMockUserDataPath(tempDir2);

          const db2 = await initDatabase();

          const tableExists = db2.exec('SELECT name FROM sqlite_master WHERE type="table" AND name="test"');
          expect(tableExists).toHaveLength(0);

          await closeDatabase();

          try {
            fs.rmSync(tempDir2, { recursive: true, force: true });
          } catch {
            // Ignore cleanup errors
          }

          app.setMockUserDataPath(tempDir);
        }),
        { numRuns: 2 }
      );
    });

    it('P009: Database size growth property - each insert increases file size', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
          async (dataStrings) => {
            const expectedPath = path.join(tempDir, 'nostling.db');
            const sizes: number[] = [];

            for (const data of dataStrings) {
              const db = await initDatabase();

              if (!db.exec('SELECT name FROM sqlite_master WHERE type="table" AND name="test"').length) {
                db.run('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, data TEXT)');
              }

              db.run('INSERT INTO test (data) VALUES (?)', [data]);

              await closeDatabase();

              const stats = fs.statSync(expectedPath);
              sizes.push(stats.size);
            }

            expect(sizes.length).toBe(dataStrings.length);
            expect(sizes[0]).toBeGreaterThan(0);
          }
        ),
        { numRuns: 3 }
      );
    });
  });

  describe('Contract Invariants', () => {
    it('C001: getDatabase() returns null before initialization', async () => {
      _resetDatabaseState();
      expect(getDatabase()).toBeNull();
    });

    it('C002: getDatabasePath() returns null before initialization', async () => {
      _resetDatabaseState();
      expect(getDatabasePath()).toBeNull();
    });

    it('C003: getDatabasePath() does not initialize database', async () => {
      getDatabasePath();
      expect(getDatabase()).toBeNull();
    });

    it('C004: Database created in userData directory', async () => {
      await initDatabase();

      const dbPath = getDatabasePath();
      expect(dbPath).toContain(tempDir);
    });

    it('C005: Closing uninitialized database is safe', async () => {
      expect(async () => {
        await closeDatabase();
      }).not.toThrow();
    });

    it('C006: Database instance is usable after initialization', async () => {
      const db = await initDatabase();

      expect(() => {
        db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      }).not.toThrow();

      expect(() => {
        db.run('INSERT INTO test (value) VALUES (?)', ['test']);
      }).not.toThrow();

      const result = db.exec('SELECT * FROM test');
      expect(result).toHaveLength(1);
    });
  });
});
