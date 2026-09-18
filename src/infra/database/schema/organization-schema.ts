import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { timestamps } from './columns-helpers';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type OrganizationMetadata = Record<string, JsonValue>;

export const organization = pgTable('organization', {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
  slug: text().unique(),
  locale: text().notNull().default('fr'),
  logo: text().default('').notNull(),
  metadata: jsonb().$type<OrganizationMetadata>(),
  ...timestamps,
}).enableRLS();

export const member = pgTable(
  'member',
  {
    id: text().default(sql`gen_random_uuid()`).primaryKey().notNull(),
    userId: text()
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    organizationId: text()
      .references(() => organization.id, { onDelete: 'cascade' })
      .notNull(),
    role: text().notNull().default('member'),
    ...timestamps,
  },
  (table) => [
    index('member_user_id_idx').on(table.userId),
    index('member_organization_id_idx').on(table.organizationId),
    uniqueIndex('member_user_org_active_unique')
      .on(table.userId, table.organizationId)
      .where(sql`deleted_at IS NULL`),
  ],
).enableRLS();

export const invitation = pgTable(
  'invitation',
  {
    id: text().default(sql`gen_random_uuid()`).primaryKey().notNull(),
    organizationId: text()
      .references(() => organization.id, { onDelete: 'cascade' })
      .notNull(),
    email: text().notNull(),
    role: text().notNull().default('member'),
    status: text().notNull().default('pending'),
    expiresAt: timestamp().notNull(),
    inviterId: text()
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    ...timestamps,
  },
  (table) => [
    index('invitation_organization_id_idx').on(table.organizationId),
    index('invitation_email_idx').on(table.email),
  ],
).enableRLS();
