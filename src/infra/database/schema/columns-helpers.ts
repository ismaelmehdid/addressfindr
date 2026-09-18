import { timestamp } from 'drizzle-orm/pg-core';

export const timestamps = {
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp({ mode: 'date' })
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp(),
};
