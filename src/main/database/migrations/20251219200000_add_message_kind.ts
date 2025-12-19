/**
 * Add message kind column to nostr_messages table
 *
 * Stores the Nostr event kind (e.g., 4 for direct messages, 14 for NIP-17).
 * NULL for backwards compatibility with existing messages.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw('ALTER TABLE nostr_messages ADD COLUMN kind INTEGER DEFAULT NULL');
}

export async function down(knex: Knex): Promise<void> {
  // SQLite doesn't support DROP COLUMN in older versions, but sql.js should handle it
  await knex.schema.raw('ALTER TABLE nostr_messages DROP COLUMN kind');
}
