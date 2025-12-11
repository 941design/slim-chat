# Persistence Layer - Requirements Specification

## Problem Statement

The nostling application currently lacks a structured persistence layer. Application state (theme preferences, window positions, UI state) is not persisted between sessions. As the application evolves and requires updates, we need a robust database migration system to handle schema changes gracefully without losing user data.

**Why this feature exists:**
- Enable stateful user experience (theme preferences, last UI state)
- Provide foundation for future features (chat history, user preferences)
- Ensure data integrity during application updates through automated migrations

## Core Functionality

Implement a SQLite-based persistence layer using sql.js (WebAssembly, no native dependencies) with Knex.js for migration management. The system must run idempotent migrations on every application startup to ensure the database schema is always up-to-date.

## Functional Requirements

### FR1: Database Initialization
- **What**: Initialize SQLite database on first application launch
- **Location**: `{userData}/nostling.db` (platform-specific user data directory)
- **Acceptance Criteria**:
  - Database file created if it doesn't exist
  - Initial schema applied via migrations
  - Database accessible from main process only (security boundary)

### FR2: Migration Management with Knex.js
- **What**: Manage database schema versions using Knex.js migration system
- **Acceptance Criteria**:
  - Migrations stored in `src/main/database/migrations/` directory
  - Migrations run on every application startup (idempotent)
  - Migration files follow timestamp naming: `YYYYMMDDHHMMSS_description.js`
  - Track applied migrations in `knex_migrations` table
  - Migrations execute in chronological order
  - Only new/pending migrations execute on subsequent startups

### FR3: Application State Storage
- **What**: Store and retrieve application state (initial use case: theme preference)
- **Schema**: Key-value store for application state
  ```sql
  CREATE TABLE app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL  -- Unix timestamp
  );
  ```
- **Acceptance Criteria**:
  - Store theme preference (`theme: 'light' | 'dark' | 'system'`)
  - Retrieve state on application startup
  - Provide getter/setter interface from main process
  - Expose via IPC to renderer process

### FR4: Database Access Layer
- **What**: Provide abstraction layer for database operations
- **Interface**:
  ```typescript
  interface Database {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    getAll(): Promise<Record<string, string>>;
  }
  ```
- **Acceptance Criteria**:
  - Singleton pattern for database connection
  - Async API (Promise-based)
  - Error handling with typed errors
  - Connection lifecycle management (initialize on startup, close on app quit)

### FR5: Startup Migration Execution
- **What**: Execute migrations on every application startup
- **Acceptance Criteria**:
  - Migrations run before window creation
  - Migration failure prevents app startup with error dialog
  - Log migration execution (which migrations ran, duration)
  - Idempotent execution (running twice is safe)
  - Startup time impact: < 100ms for no new migrations

### FR6: IPC Handlers for Persistence
- **What**: Expose database operations to renderer process via IPC
- **Channels**:
  - `state:get` - Get application state value by key
  - `state:set` - Set application state value
  - `state:delete` - Delete application state key
  - `state:get-all` - Get all application state
- **Acceptance Criteria**:
  - Follow existing domain-based IPC pattern (`src/main/ipc/handlers.ts`)
  - Type-safe IPC contracts using shared types
  - Error propagation from main to renderer

## Critical Constraints

### C1: No Native Dependencies
- **Constraint**: Use sql.js (WebAssembly) instead of better-sqlite3 (native)
- **Why**: Avoid native module compilation and ASAR unpacking complexity
- **Impact**: Slightly slower queries, but simpler build and packaging

### C2: Migrations in Packaged App
- **Constraint**: Migration files must be accessible in ASAR-packaged app
- **Why**: electron-builder packages files into ASAR archive
- **Solution**: Include migration files in `package.json` build.files array OR read migrations from code (embedded)

### C3: Database Location
- **Constraint**: Database must be in writable location outside ASAR
- **Why**: ASAR is read-only, database needs write access
- **Location**: `app.getPath('userData')` - platform-specific writable directory

### C4: Startup Performance
- **Constraint**: Migration execution must not significantly delay app startup
- **Target**: < 100ms overhead when no new migrations
- **Why**: User experience requirement for responsive app launch

### C5: Data Durability
- **Constraint**: Database writes must be durable (WAL mode, proper shutdown)
- **Why**: Prevent data corruption on crash or force quit
- **Implementation**: Enable SQLite WAL mode, handle `before-quit` event

## Integration Points

### I1: Application Lifecycle (`src/main/index.ts`)
- Hook into `app.on('ready')` event
- Run migrations before creating main window
- Handle migration failures with error dialog
- Close database connection on `app.on('will-quit')`

### I2: IPC Handler Registration (`src/main/ipc/handlers.ts`)
- Add new `state` domain handlers
- Follow existing pattern: `registerHandlers({ ...existingHandlers, ...stateHandlers })`

### I3: Configuration System (`src/main/config.ts`)
- Consider migrating `config.json` to database (future enhancement, out of scope)
- Keep existing config.json for backward compatibility initially

### I4: Shared Types (`src/shared/types.ts`)
- Add `AppState` type for state keys/values
- Add IPC contract types for state operations

### I5: Logging (`src/main/logging.ts`)
- Log migration execution (timestamp, migrations applied, duration)
- Log database operations at debug level
- Log errors at error level with stack traces

## User Preferences

- **Migration tool**: Knex.js (native Node.js, no Java dependency)
- **Database**: sql.js (pure JavaScript, no native compilation)
- **Migration timing**: Every startup (idempotent)
- **Initial use case**: Application state storage (theme preference)

## Codebase Context

### Relevant Patterns

1. **Module-Level State Management** (`src/main/index.ts`)
   - Pattern: Module-level variables for shared state
   - Example: `let config: AppConfig = loadConfig();`
   - Apply to: Singleton database connection

2. **IPC Domain-Based Organization** (`src/main/ipc/handlers.ts`)
   - Pattern: Group related handlers by domain (`updates`, `config`, `system`)
   - Example: `window.api.updates.checkNow()`
   - Apply to: New `state` domain for persistence operations

3. **Configuration Load/Save Pattern** (`src/main/config.ts`)
   - Pattern: Load on startup, save on change, normalize/validate
   - Example: `loadConfig()`, `saveConfig()`, `normalizeConfig()`
   - Apply to: Database initialization and state operations

4. **Error Sanitization** (`src/main/integration.ts`)
   - Pattern: Full errors in dev mode, sanitized in production
   - Example: `sanitizeError(error, isDevMode())`
   - Apply to: Database error handling in IPC responses

5. **Testing with Temporary Directories** (various `*.test.ts`)
   - Pattern: `fs.mkdtempSync()` for isolated test databases
   - Example: `beforeEach(() => testDir = fs.mkdtempSync(...))`
   - Apply to: Database integration tests

### Similar Implementations

- **Config persistence**: `src/main/config.ts` shows file-based persistence pattern
- **Logging persistence**: `src/main/logging.ts` shows append-only log storage
- **IPC handlers**: `src/main/ipc/handlers.ts` shows domain organization

### Directory Structure

Proposed structure for persistence layer:
```
src/main/database/
├── index.ts                 # Database singleton, initialization
├── migrations/              # Knex.js migration files
│   └── 20250101000000_initial_schema.js
├── state.ts                 # Application state getter/setter
└── types.ts                 # Database-specific types
```

## Out of Scope

The following are explicitly **not** included in this feature:

- **Chat message persistence** - Future feature, not yet defined
- **User authentication** - No user/session management
- **Data encryption** - Database stored in plaintext (consider for future)
- **Database backups** - Manual/automatic backup system
- **Migration rollbacks** - Forward-only migrations (destructive changes require data preservation logic)
- **Multi-process access** - Database only accessed from main process
- **Config.json migration** - Keep existing JSON config for backward compatibility
- **Performance optimization** - Indexes, query optimization (add as needed)
- **Database compaction** - VACUUM, size management (add as needed)

---

**Note**: This is a requirements specification, not an architecture design.
Edge cases, error handling details, and specific implementation approaches will be
determined by the integration-architect during Phase 2.
