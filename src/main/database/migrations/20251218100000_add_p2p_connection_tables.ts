/**
 * P2P RTC Handshake State Migration
 *
 * Adds tables for:
 * - P2P connection state per contact (summary status, session tracking)
 * - P2P signal send state (idempotent delivery tracking)
 *
 * Related: specs/p2p-rtc-handshake-spec.md
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // P2P connection state: stores per-contact connection summary
  await knex.schema.createTable('p2p_connection_state', (table: Knex.TableBuilder) => {
    table.string('id').primary();
    table.text('identity_pubkey').notNullable(); // Identity attempting connection (hex format)
    table.text('contact_pubkey').notNullable(); // Contact peer (hex format)
    table.text('status').notNullable(); // 'unavailable' | 'connecting' | 'connected' | 'failed'
    table.text('session_id'); // Current/last session ID (base64)
    table.text('role'); // 'offerer' | 'answerer'
    table.timestamp('last_attempt_at'); // Last connection attempt
    table.timestamp('last_success_at'); // Last successful connection
    table.text('last_failure_reason'); // Last failure reason (nullable)
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // P2P signal send state: tracks which signals sent to which contacts (idempotence)
  await knex.schema.createTable('p2p_signal_send_state', (table: Knex.TableBuilder) => {
    table.string('id').primary();
    table.text('session_id').notNullable(); // Session this signal belongs to
    table.text('identity_pubkey').notNullable(); // Sender identity (hex format)
    table.text('contact_pubkey').notNullable(); // Recipient contact (hex format)
    table.text('signal_type').notNullable(); // 'offer' | 'answer' | 'ice' | 'close'
    table.text('signal_hash'); // Content hash for idempotence (SHA-256 hex)
    table.text('event_id'); // Nostr event ID of sent wrapped signal
    table.timestamp('last_attempt_at'); // Last send attempt
    table.timestamp('last_success_at'); // Last successful send
    table.text('last_error'); // Last error message (nullable)
  });

  // Indexes for efficient queries
  await knex.schema.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_connection_state_unique ON p2p_connection_state(identity_pubkey, contact_pubkey)'
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_p2p_connection_state_status ON p2p_connection_state(status)'
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_p2p_signal_send_state_session ON p2p_signal_send_state(session_id)'
  );
  await knex.schema.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_signal_send_state_unique ON p2p_signal_send_state(session_id, identity_pubkey, contact_pubkey, signal_type, signal_hash)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('p2p_signal_send_state');
  await knex.schema.dropTable('p2p_connection_state');
}
