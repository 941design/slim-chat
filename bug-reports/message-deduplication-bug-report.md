# Message Deduplication - Bug Report

## Bug Description
Messages received from other users are not deduplicated when the application restarts. The same messages appear multiple times in the conversation view, particularly when messages have been published to multiple Nostr relays.

## Expected Behavior
Each unique Nostr event (identified by its `event_id`) should appear exactly once in the conversation, regardless of:
- How many relays the message was published to
- How many times the application is restarted
- Whether the message was received in the current session or a previous one

## Reproduction Steps
1. Start the application with an identity that has active contacts
2. Receive messages from other users (messages will be fetched from multiple relays)
3. Verify messages appear correctly (no duplicates yet)
4. Restart the application
5. Navigate to the same conversation
6. Observe: Messages that were previously received now appear multiple times

## Actual Behavior
After application restart, messages from other users appear duplicated in the conversation view. The same message content with the same timestamp appears multiple times in the message list.

## Impact
- Severity: **Critical**
- Affected Users: All users receiving messages from others
- Affected Workflows: All message reading functionality, conversation history
- User Experience: Severely degraded - conversations become unreadable with duplicate messages
- Data Integrity: Database contains duplicate entries for the same Nostr events

## Environment/Context
- Platform: Electron application (cross-platform)
- Database: SQLite (sql.js)
- Nostr Protocol: NIP-04 encrypted messages (Kind-4 events)
- Relay Architecture: Multi-relay subscriptions (messages may arrive from multiple relays)

## Root Cause Hypothesis

Based on codebase exploration, the bug is caused by **in-memory-only deduplication that is lost on restart**:

### Current Deduplication Architecture (Three Layers):

**Layer 1: RelayPool** (`src/main/nostling/relay-pool.ts:317-330`)
- Per-subscription `seenEvents: Set<string>`
- Prevents duplicate events within a single subscription
- **Lost on restart**

**Layer 2: NostlingService** (`src/main/nostling/service.ts:616-622`)
- `private seenEventIds: Set<string>`
- Deduplication key: `${identityId}:${event.id}`
- Prevents processing same event for same identity twice
- **Lost on restart**

**Layer 3: Database**
- **NO unique constraint on `event_id` column**
- Messages table allows duplicate event_ids
- No deduplication at persistence layer

### Why Duplicates Occur on Restart:

1. **Initial Session:**
   - User receives message with `event_id="abc123"` from Relay A
   - `seenEventIds` Set contains `"identity1:abc123"`
   - Message inserted into database with unique UUID `id="uuid-1"`
   - Message received again from Relay B (same event)
   - Deduplicated by in-memory Set, not inserted again ✓

2. **After Restart:**
   - Application starts, `seenEventIds = new Set()` (empty)
   - Subscriptions reconnect to relays
   - Message with `event_id="abc123"` received again from Relay A
   - `seenEventIds` is empty, so passes deduplication check ✗
   - Message inserted AGAIN with new UUID `id="uuid-2"`
   - Now database contains two rows for same Nostr event

### Key Files and Functions:

| Component | File | Lines | Issue |
|-----------|------|-------|-------|
| In-memory dedup | `service.ts` | 90, 616-622 | Cleared on restart |
| Message ingestion | `service.ts` | 291-351 | No DB-level dedup check |
| Database schema | `migrations/20251212100000_create_nostling_tables.ts` | 67-88 | No UNIQUE constraint on event_id |
| Message display | `main.tsx` | 749-892 | Displays all DB rows without filtering |
| Message fetch | `service.ts` | 256-268 | Returns all rows, no dedup |

## Constraints
- **Backward Compatibility:** Must handle existing databases that may already contain duplicates
- **Performance:** Deduplication logic must not significantly slow down message processing (thousands of messages per conversation)
- **API Contracts:**
  - Must preserve Nostr event_id field (cannot change schema fundamentally)
  - IPC interface `listMessages()` should remain unchanged
- **Multi-relay Support:** Must continue to work with multiple relays (essential for Nostr protocol)
- **Data Migration:** May need migration to clean up existing duplicates

## Codebase Context

### Likely Location
Primary fixes needed in:
1. `src/main/database/migrations/` - Add unique constraint on event_id
2. `src/main/nostling/service.ts` - Implement DB-level deduplication in `ingestIncomingMessage()`
3. May need data cleanup migration for existing duplicates

### Related Code
- Message storage: `service.ts:291-351` (`ingestIncomingMessage()`)
- Message retrieval: `service.ts:256-268` (`listMessages()`)
- Database schema: `migrations/20251212100000_create_nostling_tables.ts`
- Relay event handling: `relay-pool.ts:310-347`, `service.ts:630-665`

### Recent Changes
- Migration `20251212100000_create_nostling_tables.ts` created the schema
- No recent commits specifically addressing deduplication
- Theme support added recently (not related to this bug)

### Similar Bugs
No evidence of similar deduplication issues in git history. This appears to be a design oversight in the initial implementation where deduplication was handled only in-memory without database-level enforcement.

## Out of Scope
- Refactoring unrelated relay connection code
- Performance optimizations beyond fix requirements
- UI/UX improvements to message display (unless required for fix)
- Changes to Nostr protocol compliance or encryption
- Migration of database technology (SQLite)
