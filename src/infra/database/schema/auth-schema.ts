import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { timestamps } from './columns-helpers';

export const user = pgTable('user', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean()
    .$defaultFn(() => false)
    .notNull(),
  image: text(),
  locale: text().notNull().default('fr'),
  firstName: text().notNull().default(''),
  lastName: text().notNull().default(''),
  ...timestamps,
}).enableRLS();

export const session = pgTable(
  'session',
  {
    id: text().primaryKey(),
    expiresAt: timestamp().notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    index('session_user_id_idx').on(table.userId),
    index('session_expires_at_idx').on(table.expiresAt),
  ],
).enableRLS();

export const account = pgTable(
  'account',
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp(),
    refreshTokenExpiresAt: timestamp(),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    index('account_account_id_idx').on(table.accountId),
    index('account_provider_id_idx').on(table.providerId),
  ],
).enableRLS();

export const verification = pgTable(
  'verification',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp().notNull(),
    ...timestamps,
  },
  (table) => [
    index('verification_identifier_idx').on(table.identifier),
    index('verification_expires_at_idx').on(table.expiresAt),
  ],
).enableRLS();
