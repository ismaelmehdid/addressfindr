import { desc, sql } from 'drizzle-orm';
import { bigint, index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { timestamps } from './columns-helpers';

export const file = pgTable(
  'file',
  {
    id: text().default(sql`gen_random_uuid()`).primaryKey().notNull(),
    userId: text()
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    originalName: text().notNull(),
    storageKey: text().notNull(),
    mimeType: text().notNull(),
    fileType: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    status: text().notNull().default('uploading'),
    indexStatus: text().notNull().default('pending'),
    indexError: text(),
    visionDescription: text(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('file_storage_key_unique').on(table.storageKey),
    index('file_user_id_idx').on(table.userId),
    index('file_index_status_idx').on(table.indexStatus),
    // Covers listFilesForUser (filter user + status, order by createdAt desc).
    index('file_user_status_created_idx').on(
      table.userId,
      table.status,
      desc(table.createdAt),
    ),
  ],
).enableRLS();
