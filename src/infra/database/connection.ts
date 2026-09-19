import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/shared/env';
import { DbLogger } from '@/shared/logger';
import * as authSchema from './schema/auth-schema';
import * as earlyAccessSchema from './schema/early-access-schema';
import * as fileSchema from './schema/file-schema';
import * as zeroentropySchema from './schema/zeroentropy-schema';

const e = env();

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const requireSsl =
  e.VERCEL_ENV === 'production' ||
  e.VERCEL_ENV === 'preview' ||
  e.DATABASE_SSL === 'require';

const conn =
  globalForDb.conn ??
  postgres(e.DATABASE_URL, {
    prepare: false,
    max: 20,
    idle_timeout: 10,
    max_lifetime: 60 * 30,
    connection: {
      statement_timeout: 5000,
    },
    ssl: requireSsl ? 'require' : undefined,
  });

if (e.NODE_ENV !== 'production') globalForDb.conn = conn;

export const db = drizzle(conn, {
  logger: new DbLogger(),
  casing: 'snake_case',
  schema: {
    ...authSchema,
    ...earlyAccessSchema,
    ...fileSchema,
    ...zeroentropySchema,
  },
});
