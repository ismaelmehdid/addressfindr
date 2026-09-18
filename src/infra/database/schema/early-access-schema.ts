import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { timestamps } from './columns-helpers';

export const earlyAccessCode = pgTable(
  'early_access_code',
  {
    id: text().primaryKey(),
    codeHash: text().notNull().unique(),
    usedBy: text().references(() => user.id, { onDelete: 'set null' }),
    usedAt: timestamp(),
    note: text(),
    ...timestamps,
  },
  (table) => [
    index('early_access_code_hash_idx').on(table.codeHash),
    index('early_access_code_used_by_idx').on(table.usedBy),
  ],
).enableRLS();
