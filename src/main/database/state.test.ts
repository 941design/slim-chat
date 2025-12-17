/**
 * Property-based tests for state.ts
 *
 * Tests verify all contract invariants and properties:
 * - Round-trip: set(k, v) then get(k) returns v
 * - Overwrite: set(k, v1) then set(k, v2) then get(k) returns v2
 * - Delete: set(k, v) then delete(k) then get(k) returns null
 * - GetAll: set multiple then getAll returns all
 * - Empty key rejection: set('', v) throws error
 * - Idempotent delete: delete(k) twice doesn't throw
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import initSqlJs, { Database } from 'sql.js';
import { getState, setState, deleteState, getAllState, DatabaseError } from './state';

let dbModule: any;

async function createFreshDatabase(): Promise<Database> {
  if (!dbModule) {
    dbModule = await initSqlJs();
  }
  const database = new dbModule.Database();

  // Create app_state table
  database.run(`
    CREATE TABLE app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER
    )
  `);

  return database;
}

let db: Database;

// Setup: Create in-memory database with app_state table for each test
beforeEach(async () => {
  db = await createFreshDatabase();
});

// Cleanup: Close database after each test
afterEach(() => {
  if (db) {
    try {
      db.close();
    } catch {
      // Database already closed, that's fine
    }
  }
});

// Arbitraries for property-based testing
// Filter out Object prototype property names to avoid prototype pollution issues
const prototypeNames = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '__proto__', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'];

const nonEmptyStringArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

const keyArb = nonEmptyStringArb.filter(s => !prototypeNames.includes(s));
const valueArb = fc.string({ minLength: 0, maxLength: 1000 });

// Generate entries with unique keys to avoid overwrites
const multipleEntriesArb = fc
  .array(fc.tuple(keyArb, valueArb), { minLength: 1, maxLength: 10 })
  .map((entries) => {
    // Remove duplicate keys, keeping the first occurrence
    const seen = new Set<string>();
    return entries.filter(([key]) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .filter((entries) => entries.length > 0);

describe('State Repository (sql.js)', () => {
  describe('Property-Based Tests', () => {
    it('P001: Round-trip - set(k, v) then get(k) returns v', () => {
      fc.assert(
        fc.property(keyArb, valueArb, (key, value) => {
          setState(db, key, value);
          const retrieved = getState(db, key);
          expect(retrieved).toBe(value);
        }),
        { numRuns: 50 }
      );
    });

    it('P002: Overwrite - set(k, v1) then set(k, v2) then get(k) returns v2', () => {
      fc.assert(
        fc.property(
          keyArb,
          valueArb,
          valueArb,
          (key, value1, value2) => {
            setState(db, key, value1);
            setState(db, key, value2);
            const retrieved = getState(db, key);
            expect(retrieved).toBe(value2);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P003: Delete - set(k, v) then delete(k) then get(k) returns null', () => {
      fc.assert(
        fc.property(keyArb, valueArb, (key, value) => {
          setState(db, key, value);
          deleteState(db, key);
          const retrieved = getState(db, key);
          expect(retrieved).toBeNull();
        }),
        { numRuns: 50 }
      );
    });

    it('P004: GetAll - set multiple then getAll returns all', async () => {
      fc.assert(
        fc.asyncProperty(multipleEntriesArb, async (entries) => {
          const testDb = await createFreshDatabase();
          try {
            const expectedState: Record<string, string> = {};

            for (const [key, value] of entries) {
              setState(testDb, key, value);
              expectedState[key] = value;
            }

            const allState = getAllState(testDb);
            expect(allState).toEqual(expectedState);
          } finally {
            testDb.close();
          }
        }),
        { numRuns: 30 }
      );
    });

    it('P005: GetAll returns empty object when no entries exist', () => {
      const allState = getAllState(db);
      expect(allState).toEqual({});
      expect(Object.keys(allState).length).toBe(0);
    });

    it('P006: Idempotent delete - delete(k) twice does not throw', () => {
      fc.assert(
        fc.property(keyArb, valueArb, (key, value) => {
          setState(db, key, value);
          deleteState(db, key);
          // Second delete should not throw
          expect(() => deleteState(db, key)).not.toThrow();
        }),
        { numRuns: 50 }
      );
    });

    it('P007: Delete non-existent key is no-op', () => {
      fc.assert(
        fc.property(keyArb, (key) => {
          // Key doesn't exist, delete should not throw
          expect(() => deleteState(db, key)).not.toThrow();
          // Verify get returns null
          expect(getState(db, key)).toBeNull();
        }),
        { numRuns: 50 }
      );
    });

    it('P008: Key comparison is case-sensitive', () => {
      fc.assert(
        fc.property(
          keyArb.filter(k => k.toLowerCase() !== k.toUpperCase()),
          valueArb,
          (baseKey, value) => {
            const key1 = baseKey.toLowerCase();
            const key2 = baseKey.toUpperCase();

            setState(db, key1, value);

            // Different case should not retrieve the value
            const retrieved = getState(db, key2);
            expect(retrieved).not.toBe(value);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('P009: GetAll after delete removes entry', async () => {
      fc.assert(
        fc.asyncProperty(multipleEntriesArb, async (entries) => {
          const testDb = await createFreshDatabase();
          try {
            // Set all entries
            for (const [key, value] of entries) {
              setState(testDb, key, value);
            }

            // Delete first entry
            if (entries.length > 0) {
              const [keyToDelete] = entries[0];
              deleteState(testDb, keyToDelete);

              // Verify getAll doesn't contain deleted key
              const allState = getAllState(testDb);
              expect(keyToDelete in allState).toBe(false);
              expect(Object.keys(allState).length).toBe(entries.length - 1);
            }
          } finally {
            testDb.close();
          }
        }),
        { numRuns: 30 }
      );
    });

    it('P010: Determinism - same key always returns same value (until modified)', () => {
      fc.assert(
        fc.property(keyArb, valueArb, (key, value) => {
          setState(db, key, value);

          const result1 = getState(db, key);
          const result2 = getState(db, key);
          const result3 = getState(db, key);

          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
          expect(result1).toBe(value);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Input Validation Tests', () => {
    it('V001: Empty key throws DatabaseError on get', () => {
      expect(() => getState(db, '')).toThrow(DatabaseError);
      expect(() => getState(db, '')).toThrow(/non-empty/i);
    });

    it('V002: Whitespace-only key throws DatabaseError on get', () => {
      expect(() => getState(db, '   ')).toThrow(DatabaseError);
      expect(() => getState(db, '\t\n')).toThrow(DatabaseError);
    });

    it('V003: Empty key throws DatabaseError on set', () => {
      expect(() => setState(db, '', 'value')).toThrow(DatabaseError);
      expect(() => setState(db, '', 'value')).toThrow(/non-empty/i);
    });

    it('V004: Whitespace-only key throws DatabaseError on set', () => {
      expect(() => setState(db, '   ', 'value')).toThrow(DatabaseError);
      expect(() => setState(db, '\t\n', 'value')).toThrow(DatabaseError);
    });

    it('V005: Empty key throws DatabaseError on delete', () => {
      expect(() => deleteState(db, '')).toThrow(DatabaseError);
      expect(() => deleteState(db, '')).toThrow(/non-empty/i);
    });

    it('V006: Whitespace-only key throws DatabaseError on delete', () => {
      expect(() => deleteState(db, '   ')).toThrow(DatabaseError);
      expect(() => deleteState(db, '\t\n')).toThrow(DatabaseError);
    });

    it('V007: Non-string key throws DatabaseError on get', () => {
      expect(() => getState(db, null as any)).toThrow(DatabaseError);
      expect(() => getState(db, undefined as any)).toThrow(DatabaseError);
      expect(() => getState(db, 123 as any)).toThrow(DatabaseError);
    });

    it('V008: Non-string key throws DatabaseError on set', () => {
      expect(() => setState(db, null as any, 'value')).toThrow(DatabaseError);
      expect(() => setState(db, undefined as any, 'value')).toThrow(DatabaseError);
      expect(() => setState(db, 123 as any, 'value')).toThrow(DatabaseError);
    });

    it('V009: Non-string value throws DatabaseError on set', () => {
      expect(() => setState(db, 'key', null as any)).toThrow(DatabaseError);
      expect(() => setState(db, 'key', undefined as any)).toThrow(DatabaseError);
      expect(() => setState(db, 'key', 123 as any)).toThrow(DatabaseError);
    });

    it('V010: Non-string key throws DatabaseError on delete', () => {
      expect(() => deleteState(db, null as any)).toThrow(DatabaseError);
      expect(() => deleteState(db, undefined as any)).toThrow(DatabaseError);
      expect(() => deleteState(db, 123 as any)).toThrow(DatabaseError);
    });
  });

  describe('Error Handling Tests', () => {
    it('E001: Empty key throws DatabaseError with descriptive message on get', () => {
      const error = new DatabaseError('Test message');
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.name).toBe('DatabaseError');
      expect(error.message).toBe('Test message');
    });

    it('E002: DatabaseError can be constructed with cause', () => {
      const cause = new Error('Original error');
      const error = new DatabaseError('Wrapped error', cause);
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.cause).toBe(cause);
      expect(error.message).toBe('Wrapped error');
    });
  });

  describe('Edge Cases', () => {
    it('C001: Very long key and value', () => {
      const longKey = 'k'.repeat(100);
      const longValue = 'v'.repeat(1000);

      setState(db, longKey, longValue);
      const retrieved = getState(db, longKey);
      expect(retrieved).toBe(longValue);
    });

    it('C002: Key with special characters', () => {
      const specialKey = 'key:with:colons:and/slashes\\backslashes';
      const value = 'test-value';

      setState(db, specialKey, value);
      const retrieved = getState(db, specialKey);
      expect(retrieved).toBe(value);
    });

    it('C003: Value with special characters and newlines', () => {
      const key = 'special-value-key';
      const value = 'value\nwith\nnewlines\tand\ttabs\r\nand\rcr';

      setState(db, key, value);
      const retrieved = getState(db, key);
      expect(retrieved).toBe(value);
    });

    it('C004: Empty string value is valid', () => {
      const key = 'empty-value-key';
      const value = '';

      setState(db, key, value);
      const retrieved = getState(db, key);
      expect(retrieved).toBe('');
    });

    it('C005: Multiple keys with same prefix', () => {
      const key1 = 'theme';
      const key2 = 'theme-dark';
      const key3 = 'theme-dark-mode';

      setState(db, key1, 'value1');
      setState(db, key2, 'value2');
      setState(db, key3, 'value3');

      expect(getState(db, key1)).toBe('value1');
      expect(getState(db, key2)).toBe('value2');
      expect(getState(db, key3)).toBe('value3');
    });

    it('C006: Unicode characters in key and value', () => {
      const key = 'こんにちは';
      const value = '你好世界';

      setState(db, key, value);
      const retrieved = getState(db, key);
      expect(retrieved).toBe(value);
    });

    it('C007: Numeric strings are stored and retrieved correctly', () => {
      const key = 'count';
      const value = '12345';

      setState(db, key, value);
      const retrieved = getState(db, key);
      expect(retrieved).toBe('12345');
      expect(typeof retrieved).toBe('string');
    });

    it('C008: JSON strings can be stored and retrieved', () => {
      const key = 'config';
      const value = JSON.stringify({ theme: 'dark', language: 'en' });

      setState(db, key, value);
      const retrieved = getState(db, key);
      expect(retrieved).toBe(value);
      expect(JSON.parse(retrieved!)).toEqual({ theme: 'dark', language: 'en' });
    });
  });

  describe('Integration Tests', () => {
    it('I001: Multiple operations sequence', () => {
      setState(db, 'key1', 'value1');
      setState(db, 'key2', 'value2');
      setState(db, 'key3', 'value3');

      expect(getState(db, 'key2')).toBe('value2');

      deleteState(db, 'key2');
      expect(getState(db, 'key2')).toBeNull();

      const allState = getAllState(db);
      expect(Object.keys(allState).length).toBe(2);
      expect(allState['key1']).toBe('value1');
      expect(allState['key3']).toBe('value3');
    });

    it('I002: Overwrite and delete sequence', () => {
      setState(db, 'config', 'v1');
      setState(db, 'config', 'v2');
      setState(db, 'config', 'v3');

      expect(getState(db, 'config')).toBe('v3');

      deleteState(db, 'config');
      expect(getState(db, 'config')).toBeNull();

      setState(db, 'config', 'v4');
      expect(getState(db, 'config')).toBe('v4');
    });

    it('I003: getAllState reflects all operations', () => {
      setState(db, 'a', 'valueA');
      setState(db, 'b', 'valueB');
      setState(db, 'c', 'valueC');

      let all = getAllState(db);
      expect(Object.keys(all).length).toBe(3);

      deleteState(db, 'b');
      all = getAllState(db);
      expect(Object.keys(all).length).toBe(2);
      expect('b' in all).toBe(false);

      setState(db, 'b', 'newValueB');
      all = getAllState(db);
      expect(Object.keys(all).length).toBe(3);
      expect(all['b']).toBe('newValueB');
    });
  });
});
