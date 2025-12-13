import { Knex } from "knex";

// BUG FIX: Prevent duplicate event ingestion per conversation
// Root cause: No database-level constraint preventing duplicate event_id insertion per conversation
// Bug report: bug-reports/duplicate-event-ingestion.md
// Date: 2025-12-13

export async function up(knex: Knex): Promise<void> {
  // Clean up existing duplicates per conversation (keep newest by timestamp)
  await knex.schema.raw(`
    DELETE FROM nostr_messages
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY identity_id, contact_id, event_id ORDER BY timestamp DESC) AS rn
        FROM nostr_messages
        WHERE event_id IS NOT NULL
      ) t
      WHERE rn > 1
    )
  `);

  // Add UNIQUE partial index on (identity_id, contact_id, event_id) for per-conversation deduplication
  await knex.schema.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_nostr_messages_event_id_unique ON nostr_messages(identity_id, contact_id, event_id) WHERE event_id IS NOT NULL'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS idx_nostr_messages_event_id_unique');
}
