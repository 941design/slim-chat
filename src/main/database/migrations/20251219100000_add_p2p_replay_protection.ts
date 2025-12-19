/**
 * P2P Replay Protection Migration
 *
 * Adds table for tracking processed P2P signals to prevent replay attacks.
 *
 * BUG FIX: Replay attack vulnerability
 * Root cause: No nonce tracking mechanism
 * Bug report: system-verifier/replay-attack-vulnerability
 * Date: 2025-12-19
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // P2P processed signals: tracks (session_id, nonce) pairs to prevent replay
  await knex.schema.createTable('p2p_processed_signals', (table: Knex.TableBuilder) => {
    table.text('session_id').notNullable();
    table.text('nonce').notNullable(); // 32-character hex string
    table.timestamp('processed_at').defaultTo(knex.fn.now());
    table.primary(['session_id', 'nonce']);
  });

  // Index for cleanup of old entries
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_p2p_processed_signals_timestamp ON p2p_processed_signals(processed_at)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('p2p_processed_signals');
}
