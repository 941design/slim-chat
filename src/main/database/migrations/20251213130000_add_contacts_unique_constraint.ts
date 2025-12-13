/**
 * Add UNIQUE constraint on (identity_id, npub) to prevent duplicate contacts
 *
 * Addresses issue I4: Database duplicate prevention
 * Ensures the same npub cannot be added twice for the same identity
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_nostr_contacts_identity_npub ON nostr_contacts(identity_id, npub)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS idx_nostr_contacts_identity_npub');
}
