/**
 * Relay Sync State Migration
 *
 * Creates table for tracking per-relay, per-identity, per-kind event timestamps.
 * Used for sparse polling with timestamp-based 'since' filters to reduce
 * redundant relay traffic.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('nostr_relay_sync_state', (table: Knex.TableBuilder) => {
    table.string('id').primary();
    table.text('identity_id').notNullable();
    table.text('relay_url').notNullable();
    table.integer('event_kind').notNullable();
    table.integer('last_event_timestamp').notNullable(); // Unix seconds
    table.integer('updated_at').notNullable(); // Unix seconds
  });

  // Unique constraint: one row per identity/relay/kind combination
  await knex.schema.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_sync_unique ON nostr_relay_sync_state(identity_id, relay_url, event_kind)'
  );
  // Index for efficient per-identity queries
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_relay_sync_identity ON nostr_relay_sync_state(identity_id)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('nostr_relay_sync_state');
}
