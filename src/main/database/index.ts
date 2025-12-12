/**
 * Database Lifecycle Management
 *
 * Integrates database initialization, migration, and cleanup with Electron app lifecycle.
 * Provides wrapper functions for state operations that handle database access.
 */

import { app, dialog } from 'electron';
import { log } from '../logging';
import { initDatabase, closeDatabase, flushDatabase, getDatabase } from './connection';
import { runMigrations } from './migrations';
import { getState, setState, deleteState, getAllState } from './state';

/**
 * Initialize database and run migrations
 *
 * Called during app.on('ready'), before window creation.
 * Migration errors prevent app startup with error dialog.
 *
 * CONTRACT:
 *   Inputs:
 *     - None (uses Electron app context)
 *
 *   Outputs:
 *     - void (side effect: database initialized and migrated)
 *
 *   Invariants:
 *     - Database initialized from userData directory
 *     - All pending migrations executed
 *     - Logs migration execution details
 *
 *   Properties:
 *     - Idempotent: safe to call multiple times (subsequent calls are no-op)
 *     - Blocking: must complete before app continues
 *     - Error handling: shows dialog and quits app on failure
 *
 *   Algorithm:
 *     1. Start timer for performance measurement
 *     2. Initialize database connection via initDatabase()
 *     3. Run pending migrations via runMigrations()
 *     4. Log migration results (executed migrations, duration)
 *     5. On error:
 *        a. Show error dialog to user
 *        b. Log error details
 *        c. Quit application via app.quit()
 */
export async function initializeDatabaseWithMigrations(): Promise<void> {
  const startTime = Date.now();

  try {
    log('info', 'Initializing database...');
    const db = await initDatabase();

    log('info', 'Running database migrations...');
    const result = await runMigrations(db);

    const duration = Date.now() - startTime;

    if (result.executedMigrations.length > 0) {
      log('info', `Applied ${result.executedMigrations.length} migration(s): ${result.executedMigrations.join(', ')}`);
    } else {
      log('info', 'No new migrations to apply');
    }

    log('info', `Database ready (${duration}ms total, ${result.duration}ms migrations)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('error', `Database initialization failed: ${message}`);

    await dialog.showErrorBox(
      'Database Error',
      `Failed to initialize application database:\n\n${message}\n\nThe application will now quit.`
    );

    app.quit();
    throw error;
  }
}

/**
 * Close database connection
 *
 * Called during app.on('will-quit'), ensures database is persisted to disk.
 *
 * CONTRACT:
 *   Inputs:
 *     - None
 *
 *   Outputs:
 *     - void (side effect: database closed and written to disk)
 *
 *   Invariants:
 *     - Database flushed to disk
 *     - Connection closed
 *
 *   Properties:
 *     - Safe: no-op if database not initialized
 *     - Idempotent: safe to call multiple times
 */
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await closeDatabase();
    log('info', 'Database closed');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('error', `Failed to close database: ${message}`);
  }
}

/**
 * Flush database to disk without closing connection
 *
 * Called periodically to ensure data safety in case of crashes.
 *
 * CONTRACT:
 *   Inputs:
 *     - None
 *
 *   Outputs:
 *     - void (side effect: database written to disk)
 *
 *   Invariants:
 *     - Database flushed to disk
 *     - Connection remains open
 *
 *   Properties:
 *     - Safe: no-op if database not initialized
 *     - Non-destructive: database remains usable after flush
 */
export async function flushDatabaseToDisk(): Promise<void> {
  try {
    await flushDatabase();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('error', `Failed to flush database: ${message}`);
  }
}

/**
 * IPC handler wrappers for state operations
 *
 * These functions are called by IPC handlers and provide error handling.
 */

export async function getStateValue(key: string): Promise<string | null> {
  const db = getDatabase();
  if (!db) {
    throw new Error('Database not initialized');
  }
  return getState(db, key);
}

export async function setStateValue(key: string, value: string): Promise<void> {
  const db = getDatabase();
  if (!db) {
    throw new Error('Database not initialized');
  }
  setState(db, key, value);
}

export async function deleteStateValue(key: string): Promise<void> {
  const db = getDatabase();
  if (!db) {
    throw new Error('Database not initialized');
  }
  deleteState(db, key);
}

export async function getAllStateValues(): Promise<Record<string, string>> {
  const db = getDatabase();
  if (!db) {
    throw new Error('Database not initialized');
  }
  return getAllState(db);
}
