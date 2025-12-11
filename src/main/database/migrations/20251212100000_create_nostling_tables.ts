/**
 * Nostling data model migration
 *
 * Creates identities, contacts, messages, and relay tables to support the
 * nostling MVP. Fields align with the spec in specs/nostling.md and favor
 * simple text storage for portability in the sql.js environment.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('nostr_identities', (table: Knex.TableBuilder) => {
    table.string('id').primary();
    table.text('npub').notNullable();
    table.text('secret_ref').notNullable();
    table.text('label').notNullable();
    table.text('relays'); // JSON-encoded relay list
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('nostr_contacts', (table: Knex.TableBuilder) => {
    table.string('id').primary();
    table.string('identity_id').notNullable();
    table.text('npub').notNullable();
    table.text('alias').notNullable();
    table.text('state').notNullable(); // pending | connected
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('last_message_at');
  });

  await knex.schema.createTable('nostr_messages', (table: Knex.TableBuilder) => {
    table.string('id').primary();
    table.string('identity_id').notNullable();
    table.string('contact_id').notNullable();
    table.text('sender_npub').notNullable();
    table.text('recipient_npub').notNullable();
    table.text('ciphertext').notNullable();
    table.text('event_id');
    table.timestamp('timestamp').notNullable();
    table.text('status').notNullable(); // queued | sending | sent | error
    table.text('direction').notNullable(); // incoming | outgoing
  });

  await knex.schema.createTable('nostr_relays', (table: Knex.TableBuilder) => {
    table.string('id').primary();
    table.string('identity_id'); // null for default relay entries
    table.text('url').notNullable();
    table.integer('read').notNullable().defaultTo(1);
    table.integer('write').notNullable().defaultTo(1);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_nostr_identities_npub ON nostr_identities(npub)'
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_nostr_contacts_identity ON nostr_contacts(identity_id)'
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_nostr_messages_contact_timestamp ON nostr_messages(contact_id, timestamp)'
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_nostr_relays_identity ON nostr_relays(identity_id)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('nostr_relays');
  await knex.schema.dropTable('nostr_messages');
  await knex.schema.dropTable('nostr_contacts');
  await knex.schema.dropTable('nostr_identities');
}
