/**
 * Private Profile Sharing Migration (NIP-59)
 *
 * Adds tables for:
 * - Profile storage (private received, public discovered, private authored)
 * - Per-contact send state tracking
 * - Public profile presence indicators
 *
 * Related: specs/private-profile-sharing.md
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Profiles table: stores private and public profiles
  await knex.schema.createTable('nostr_profiles', (table: Knex.TableBuilder) => {
    table.string('id').primary();
    table.text('owner_pubkey').notNullable(); // Pubkey this profile describes (hex format)
    table.text('source').notNullable(); // 'private_received' | 'public_discovered' | 'private_authored'
    table.text('content_json').notNullable(); // kind:0-shaped JSON (name, about, picture, etc.)
    table.text('event_id'); // Nostr event ID (nullable for edge cases)
    table.integer('valid_signature').notNullable().defaultTo(1); // Signature validation result (0=false, 1=true)
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Private profile send state: tracks which contacts received which profile version
  await knex.schema.createTable('nostr_profile_send_state', (table: Knex.TableBuilder) => {
    table.string('id').primary();
    table.text('identity_pubkey').notNullable(); // Identity sending the profile (hex format)
    table.text('contact_pubkey').notNullable(); // Contact receiving the profile (hex format)
    table.text('last_sent_profile_event_id'); // Event ID of last sent profile
    table.text('last_sent_profile_hash'); // Content hash of last sent profile (for idempotence)
    table.timestamp('last_attempt_at'); // Last send attempt timestamp
    table.timestamp('last_success_at'); // Last successful send timestamp
    table.text('last_error'); // Last error message (nullable)
  });

  // Public profile presence: tracks existence of public kind:0 profiles
  await knex.schema.createTable('nostr_public_profile_presence', (table: Knex.TableBuilder) => {
    table.string('id').primary();
    table.text('pubkey').notNullable().unique(); // Pubkey to check (hex format)
    table.integer('has_public_profile').notNullable().defaultTo(0); // Public profile found? (0=false, 1=true)
    table.timestamp('last_checked_at'); // Last check timestamp
    table.integer('last_check_success').notNullable().defaultTo(0); // Last check succeeded? (0=false, 1=true)
    table.text('last_seen_event_id'); // Last seen kind:0 event ID (nullable)
  });

  // Indexes for efficient queries
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_nostr_profiles_owner_source ON nostr_profiles(owner_pubkey, source)'
  );
  await knex.schema.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_nostr_profile_send_state_unique ON nostr_profile_send_state(identity_pubkey, contact_pubkey)'
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_nostr_public_profile_presence_pubkey ON nostr_public_profile_presence(pubkey)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('nostr_public_profile_presence');
  await knex.schema.dropTable('nostr_profile_send_state');
  await knex.schema.dropTable('nostr_profiles');
}
