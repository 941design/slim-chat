# Relay Manager Redesign - Requirements Specification

## Problem Statement

The current relay management UI uses a card-based layout that doesn't scale well to many relays, lacks granular read/write control, doesn't persist configuration to human-editable files, and provides no protection against concurrent external edits. Users need a compact, powerful relay manager that supports per-identity configuration with filesystem sync.

## Core Functionality

Transform the relay management system from a card-based UI with database storage into a compact, high-density table interface with filesystem-based configuration. Each identity will have its own `relays.json` file that can be edited externally, with overwrite protection to prevent data loss from concurrent edits.

## Functional Requirements

### FR-1: Compact Table Layout
- Replace current card-based `RelayConfigCard` with a high-density table/list
- Row height ≤ 36px to fit 12-15 visible rows on a 13" display without scrolling
- Columns in order: Drag handle | ☑ Enabled | Status dot | Relay URL (inline editable) | ☑ Read | ☑ Write | Remove (−)
- Visible position numbers for each row
- "Add relay" inline input at bottom of table
- **Acceptance**: Table renders with all columns, rows fit within 36px height

### FR-2: Read/Write Policy Checkboxes
- Separate ☑ Read and ☑ Write checkbox columns per relay
- Tooltips: "Receive events" for Read, "Publish events" for Write
- Default for new relays: both checked
- Backend must respect read/write flags when subscribing/publishing
- **Acceptance**: Toggling read-only prevents publishing to that relay; toggling write-only prevents subscribing

### FR-3: Drag-to-Reorder
- Install and integrate `@dnd-kit/core` and `@dnd-kit/sortable` libraries
- Drag handle in leftmost column
- Visual feedback during drag (placeholder, drop indicator)
- Persist new order immediately to config file
- **Acceptance**: User can drag a relay from position 3 to position 1, order persists after page refresh

### FR-4: Live Connection Status
- Real-time status indicator (green/yellow/red dot) per relay
- Status states: connected (green), connecting (yellow), disconnected/error (red)
- Tooltip shows status text or error message
- Footer summary: "X relays · Y connected · Z failed"
- **Note**: Latency measurement deferred to future version
- **Acceptance**: Status dots update within 2 seconds of connection state change

### FR-5: Per-Identity Filesystem Config
- Each identity stores relay config at: `~/.config/nostling/identities/<identity-id>/relays.json`
- No global defaults file - each identity has its own complete relay list
- On identity creation, copy default relay list to new identity's `relays.json`
- File format (pretty-printed JSON):
  ```json
  [
    { "url": "wss://relay.damus.io", "read": true, "write": true, "order": 0 },
    { "url": "wss://eden.nostr.land", "read": true, "write": false, "order": 1 }
  ]
  ```
- All UI changes (add, remove, reorder, toggle) immediately write to file
- No "Save Changes" button - changes auto-save
- **Acceptance**: Editing relay in UI updates file within 1 second; editing file externally and reloading UI shows changes

### FR-6: Overwrite Protection
- Compute SHA-256 hash of file content when UI loads
- Before every write operation:
  1. Re-read current file content
  2. Compute hash of current content
  3. Compare with stored hash from last load
  4. If hashes differ → show conflict modal
- Conflict modal options: [Reload] [Overwrite] [Cancel]
- "Reload" discards in-memory changes, re-renders from disk
- "Overwrite" saves current UI state, replacing external changes
- "Cancel" aborts the current operation
- **Acceptance**: User A edits file externally, User B (in UI) tries to save → conflict modal appears

### FR-7: Graceful Config Error Handling
- On startup, validate each identity's `relays.json`
- If file is malformed JSON: log warning, use empty relay list, show non-blocking notification
- If file is missing: create with default relay list
- If directory doesn't exist: create directory structure
- Never crash on config file errors
- **Acceptance**: Corrupted JSON file logs error, app starts successfully with empty relay list for that identity

### FR-8: Migration from Database
- On first run after update, migrate existing relay config from SQLite to filesystem
- For each identity: read relays from `nostr_relays` table, write to identity's `relays.json`
- After successful migration, remove relay data from database (or mark as migrated)
- Migration runs once, idempotently
- **Acceptance**: Existing users' relay configurations preserved after update

### FR-9: First-Launch Defaults
- Ship with sensible pre-populated default relay list
- Default relays (with appropriate read/write settings):
  - Public relays: read + write enabled
  - Known archive relays: read only
  - Known blast relays: write only
- New identities always start with the default list
- Never show empty relay screen
- **Acceptance**: New identity created → has 8-12 default relays configured

## Critical Constraints

### CC-1: Data Separation
- Messages and contact data remain in SQLite database
- Only relay configuration moves to filesystem
- Identity management stays in database for now

### CC-2: Performance
- Table must handle 50+ relays without UI collapse
- File I/O must not block UI thread (use async operations)
- Status updates must not cause excessive re-renders

### CC-3: Accessibility
- Drag-and-drop must have keyboard alternative (dnd-kit provides this)
- Status indicators must not rely solely on color (include tooltip text)
- Inline editing must work with screen readers

## Integration Points

### IP-1: RelayPool Integration
- `RelayPool` class must be extended to respect read/write flags
- Subscribe operations use only relays with `read: true`
- Publish operations use only relays with `write: true`
- Status callbacks already exist, wire to new UI

### IP-2: NostlingService Changes
- Remove `getRelayConfig()` and `setRelayConfig()` methods from service
- Add new `RelayConfigManager` class for filesystem operations
- Update `initialize()` to load from filesystem instead of database

### IP-3: IPC Channel Updates
- Update `nostling:relays:get` to read from filesystem
- Update `nostling:relays:set` to write to filesystem with hash check
- Add `nostling:relays:reload` for explicit reload from disk
- Return conflict status when hash mismatch detected

### IP-4: Type System Updates
- Extend `NostlingRelayEndpoint` to `{ url: string, read: boolean, write: boolean, order: number }`
- Update all type references throughout codebase
- Add `RelayConfigConflict` type for overwrite protection responses

## User Preferences (from clarification)

- Storage: Filesystem JSON for config, SQLite for data
- Data model: Full read/write/order flags in relay type
- Reordering: Use dnd-kit library for drag-and-drop
- Status: Show connection status dots, defer latency measurement
- File watching: Check hash before save only (no active watcher)
- Defaults: Each identity has its own `relays.json`, no global defaults file

## Codebase Context

### Existing Implementation
- Current UI: `RelayConfigCard` component in `src/renderer/main.tsx` (lines 491-722)
- Current types: `NostlingRelayEndpoint`, `NostlingRelayConfig` in `src/shared/types.ts`
- Current storage: `nostr_relays` table with `identity_id`, `url` columns
- Current service: `getRelayConfig()`, `setRelayConfig()` in `src/main/nostling/service.ts`
- Relay pool: `RelayPool` class in `src/main/nostling/relay-pool.ts` with status tracking

### Patterns to Follow
- State management: `useNostlingState()` hook pattern
- IPC: Nested API structure (`window.api.nostling.relays.*`)
- Config files: Existing `config.ts` pattern for reading/writing JSON
- Error handling: `withErrorLogging()` wrapper pattern

## Out of Scope

- Latency measurement (deferred to future version)
- Active file watching (check hash before save only)
- Migrating identity management to filesystem
- Bulk actions bar (mentioned in original spec but not critical for MVP)
- Changing how contacts/messages are stored

---

**Note**: This is a requirements specification, not an architecture design.
Edge cases, error handling details, and implementation approach will be
determined by the integration-architect during Phase 2.
