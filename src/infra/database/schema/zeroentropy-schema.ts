import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { timestamps } from './columns-helpers';

export const zeroentropyCollection = pgTable(
  'zeroentropy_collection',
  {
    id: text().default(sql`gen_random_uuid()`).primaryKey().notNull(),
    userId: text()
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    collectionName: text().notNull(),
    status: text().notNull().default('pending'),
    documentCount: integer().notNull().default(0),
    lastSyncAt: timestamp(),
    lastSyncError: text(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('zeroentropy_collection_user_unique').on(table.userId),
    uniqueIndex('zeroentropy_collection_name_unique').on(table.collectionName),
  ],
).enableRLS();

export const zeroentropyEntity = pgTable(
  'zeroentropy_entity',
  {
    id: text().default(sql`gen_random_uuid()`).primaryKey().notNull(),
    collectionId: text()
      .references(() => zeroentropyCollection.id, { onDelete: 'cascade' })
      .notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    docTypes: text('doc_types').array().notNull().default(sql`'{}'::text[]`),
    contentHash: text().notNull(),
    status: text().notNull().default('pending'),
    lastError: text(),
    lastIndexedAt: timestamp(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('zeroentropy_entity_unique').on(
      table.collectionId,
      table.entityType,
      table.entityId,
    ),
    index('zeroentropy_entity_collection_idx').on(table.collectionId),
    index('zeroentropy_entity_entity_idx').on(table.entityType, table.entityId),
    index('zeroentropy_entity_status_idx').on(table.status),
  ],
).enableRLS();

export const failedSyncOperation = pgTable(
  'failed_sync_operation',
  {
    id: text().default(sql`gen_random_uuid()`).primaryKey().notNull(),
    eventId: text().notNull(),
    userId: text()
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    operation: text().notNull(),
    source: text().notNull(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    isPermanentlyFailed: boolean().notNull().default(false),
    nextRetryAt: timestamp().notNull().defaultNow(),
    lastAttemptAt: timestamp(),
    payload: text(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('failed_sync_operation_entity_unique').on(
      table.userId,
      table.entityType,
      table.entityId,
    ),
    index('failed_sync_operation_event_idx').on(table.eventId),
    index('failed_sync_operation_user_idx').on(table.userId),
    index('failed_sync_operation_next_retry_idx').on(table.nextRetryAt),
    index('failed_sync_operation_entity_idx').on(
      table.entityType,
      table.entityId,
    ),
  ],
).enableRLS();
