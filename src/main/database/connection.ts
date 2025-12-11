/**
 * Database Connection Manager
 *
 * Manages singleton SQLite database connection using sql.js (WebAssembly).
 * Database stored in userData directory, accessible only from main process.
 */

import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

let db: Database | null = null;
let dbPath: string | null = null;

/**
 * Reset database state (for testing only)
 * Internal function not exported
 */
export function _resetDatabaseState(): void {
  db = null;
  dbPath = null;
}

/**
 * Initialize database connection
 *
 * CONTRACT:
 *   Inputs:
 *     - None (uses app.getPath('userData') for database location)
 *
 *   Outputs:
 *     - database: Database instance from sql.js
 *
 *   Invariants:
 *     - Singleton pattern: only one database instance exists
 *     - Database file created if doesn't exist
 *     - Database located at {userData}/nostling.db
 *     - WAL mode enabled for better concurrency
 *     - Calling multiple times returns same instance
 *
 *   Properties:
 *     - Idempotent: calling initDatabase() multiple times returns same instance
 *     - Persistent: database survives application restarts
 *     - Isolated: each application installation has separate database
 *
 *   Algorithm:
 *     1. If database instance already exists, return it
 *     2. Initialize sql.js WebAssembly module
 *     3. Determine database file path: {userData}/nostling.db
 *     4. If database file exists:
 *        a. Read file into buffer
 *        b. Create Database instance from buffer
 *     5. If database file doesn't exist:
 *        a. Create new empty Database instance
 *     6. Enable WAL mode via PRAGMA journal_mode=WAL
 *     7. Store instance in module-level variable
 *     8. Return database instance
 */
export async function initDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  const SQL = await initSqlJs();
  const userDataPath = app.getPath('userData');
  dbPath = path.join(userDataPath, 'nostling.db');

  let database: Database;
  try {
    const fileBuffer = fs.readFileSync(dbPath);
    database = new SQL.Database(fileBuffer);
  } catch {
    database = new SQL.Database();
  }

  database.run('PRAGMA journal_mode=WAL');
  db = database;

  return db;
}

/**
 * Get current database instance
 *
 * CONTRACT:
 *   Inputs:
 *     - None
 *
 *   Outputs:
 *     - database: Database instance, or null if not initialized
 *
 *   Invariants:
 *     - Returns null if initDatabase() not called
 *     - Returns same instance as initDatabase() if called
 *
 *   Properties:
 *     - Non-initializing: never creates database, only retrieves
 */
export function getDatabase(): Database | null {
  return db;
}

/**
 * Close database connection and persist to disk
 *
 * CONTRACT:
 *   Inputs:
 *     - None (uses module-level database instance)
 *
 *   Outputs:
 *     - void (side effect: writes database to disk, closes connection)
 *
 *   Invariants:
 *     - Database file written to {userData}/nostling.db
 *     - Database instance closed and set to null
 *     - Idempotent: safe to call multiple times
 *
 *   Properties:
 *     - Persistence: all changes flushed to disk
 *     - Cleanup: resources released
 *     - Safe: no-op if database not initialized
 *
 *   Algorithm:
 *     1. If database instance is null, return (nothing to close)
 *     2. Export database to binary buffer via db.export()
 *     3. Ensure userData directory exists
 *     4. Write buffer to {userData}/nostling.db atomically
 *     5. Close database instance via db.close()
 *     6. Set module-level db variable to null
 */
export async function closeDatabase(): Promise<void> {
  if (!db || !dbPath) {
    return;
  }

  const data = db.export();
  const buffer = Buffer.from(data);

  const userDataPath = app.getPath('userData');
  fs.mkdirSync(userDataPath, { recursive: true });

  const tempPath = `${dbPath}.tmp`;
  fs.writeFileSync(tempPath, buffer);
  fs.renameSync(tempPath, dbPath);

  db.close();
  db = null;
}

/**
 * Get database file path
 *
 * CONTRACT:
 *   Inputs:
 *     - None
 *
 *   Outputs:
 *     - filePath: absolute path to database file, or null if not initialized
 *
 *   Invariants:
 *     - Path format: {userData}/nostling.db
 *     - Path is absolute, not relative
 */
export function getDatabasePath(): string | null {
  return dbPath;
}
