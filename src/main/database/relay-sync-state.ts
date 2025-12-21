/**
 * Relay Sync State Repository
 *
 * Manages per-relay, per-identity, per-kind timestamp tracking to enable
 * sparse polling with accurate 'since' filters. Reduces redundant relay
 * traffic by only requesting events newer than the last received.
 */

import { Database } from 'sql.js';
import { randomUUID } from 'node:crypto';

export class RelaySyncStateError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'RelaySyncStateError';
  }
}

export interface RelaySyncState {
  id: string;
  identityId: string;
  relayUrl: string;
  eventKind: number;
  lastEventTimestamp: number; // Unix seconds
  updatedAt: number; // Unix seconds
}

/**
 * Get the minimum timestamp across all relays for an identity and kind.
 *
 * This is the safe 'since' value for polling when querying all relays.
 * Returns null if no sync state exists (first sync scenario).
 */
export function getMinTimestampForKind(
  database: Database,
  identityId: string,
  eventKind: number
): number | null {
  try {
    const stmt = database.prepare(
      `SELECT MIN(last_event_timestamp) as min_ts
       FROM nostr_relay_sync_state
       WHERE identity_id = ? AND event_kind = ?`
    );
    stmt.bind([identityId, eventKind]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!result || result.min_ts === null) {
      return null;
    }
    return result.min_ts as number;
  } catch (error) {
    throw new RelaySyncStateError(
      `Failed to get min timestamp for identity ${identityId}, kind ${eventKind}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Get the last event timestamp for a specific identity/relay/kind combination.
 * Returns null if no sync state exists.
 */
export function getLastEventTimestamp(
  database: Database,
  identityId: string,
  relayUrl: string,
  eventKind: number
): number | null {
  try {
    const stmt = database.prepare(
      `SELECT last_event_timestamp
       FROM nostr_relay_sync_state
       WHERE identity_id = ? AND relay_url = ? AND event_kind = ?`
    );
    stmt.bind([identityId, relayUrl, eventKind]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();

    if (!result) {
      return null;
    }
    return result.last_event_timestamp as number;
  } catch (error) {
    throw new RelaySyncStateError(
      `Failed to get timestamp for ${identityId}/${relayUrl}/${eventKind}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Update the last event timestamp for a specific identity/relay/kind.
 * Uses upsert semantics (INSERT OR REPLACE).
 * Only updates if newTimestamp > existing timestamp (monotonic).
 */
export function updateLastEventTimestamp(
  database: Database,
  identityId: string,
  relayUrl: string,
  eventKind: number,
  newTimestamp: number
): void {
  try {
    const now = Math.floor(Date.now() / 1000);

    // Check existing timestamp to ensure monotonic updates
    const existing = getLastEventTimestamp(database, identityId, relayUrl, eventKind);
    if (existing !== null && existing >= newTimestamp) {
      // Skip update if existing timestamp is >= new timestamp
      return;
    }

    // Generate new ID for insert, or reuse existing
    const id = randomUUID();

    database.run(
      `INSERT OR REPLACE INTO nostr_relay_sync_state
       (id, identity_id, relay_url, event_kind, last_event_timestamp, updated_at)
       VALUES (
         COALESCE(
           (SELECT id FROM nostr_relay_sync_state
            WHERE identity_id = ? AND relay_url = ? AND event_kind = ?),
           ?
         ),
         ?, ?, ?, ?, ?
       )`,
      [identityId, relayUrl, eventKind, id, identityId, relayUrl, eventKind, newTimestamp, now]
    );
  } catch (error) {
    throw new RelaySyncStateError(
      `Failed to update timestamp for ${identityId}/${relayUrl}/${eventKind}`,
      error instanceof Error ? error : undefined
    );
  }
}

export interface TimestampUpdate {
  identityId: string;
  relayUrl: string;
  eventKind: number;
  timestamp: number;
}

/**
 * Batch update timestamps for multiple relays/kinds.
 * Used for debounced writes after processing multiple events.
 * Only updates if new timestamp > existing (monotonic).
 */
export function batchUpdateTimestamps(
  database: Database,
  updates: TimestampUpdate[]
): void {
  if (updates.length === 0) return;

  try {
    // Use transaction for batch efficiency
    database.run('BEGIN TRANSACTION');

    for (const update of updates) {
      updateLastEventTimestamp(
        database,
        update.identityId,
        update.relayUrl,
        update.eventKind,
        update.timestamp
      );
    }

    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    throw new RelaySyncStateError(
      'Failed to batch update timestamps',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Get all sync states for an identity.
 * Useful for debugging and status display.
 */
export function getAllSyncStatesForIdentity(
  database: Database,
  identityId: string
): RelaySyncState[] {
  try {
    const results: RelaySyncState[] = [];
    const stmt = database.prepare(
      `SELECT id, identity_id, relay_url, event_kind, last_event_timestamp, updated_at
       FROM nostr_relay_sync_state
       WHERE identity_id = ?
       ORDER BY relay_url, event_kind`
    );
    stmt.bind([identityId]);

    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: row.id as string,
        identityId: row.identity_id as string,
        relayUrl: row.relay_url as string,
        eventKind: row.event_kind as number,
        lastEventTimestamp: row.last_event_timestamp as number,
        updatedAt: row.updated_at as number,
      });
    }

    stmt.free();
    return results;
  } catch (error) {
    throw new RelaySyncStateError(
      `Failed to get sync states for identity ${identityId}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Delete all sync states for an identity.
 * Called when identity is removed.
 */
export function deleteSyncStatesForIdentity(
  database: Database,
  identityId: string
): void {
  try {
    database.run(
      'DELETE FROM nostr_relay_sync_state WHERE identity_id = ?',
      [identityId]
    );
  } catch (error) {
    throw new RelaySyncStateError(
      `Failed to delete sync states for identity ${identityId}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Delete sync states for a specific relay (e.g., when relay is removed from config).
 */
export function deleteSyncStatesForRelay(
  database: Database,
  relayUrl: string
): void {
  try {
    database.run(
      'DELETE FROM nostr_relay_sync_state WHERE relay_url = ?',
      [relayUrl]
    );
  } catch (error) {
    throw new RelaySyncStateError(
      `Failed to delete sync states for relay ${relayUrl}`,
      error instanceof Error ? error : undefined
    );
  }
}
