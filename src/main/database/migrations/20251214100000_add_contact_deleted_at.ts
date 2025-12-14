import { Knex } from 'knex';

/**
 * Adds deleted_at column to nostr_contacts to support soft deletions.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw('ALTER TABLE nostr_contacts ADD COLUMN deleted_at DATETIME');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_nostr_contacts_identity_npub');
  await knex.schema.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_nostr_contacts_identity_npub ON nostr_contacts(identity_id, npub) WHERE deleted_at IS NULL'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS idx_nostr_contacts_identity_npub');
  await knex.schema.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_nostr_contacts_identity_npub ON nostr_contacts(identity_id, npub)'
  );
  await knex.schema.raw('ALTER TABLE nostr_contacts DROP COLUMN deleted_at');
}
