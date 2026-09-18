import 'server-only';

import { sql } from 'drizzle-orm';
import type { IndexableEntityType } from '@/core/zeroentropy/types';
import { db } from '@/infra/database/connection';

export async function withEntityLock<T>(args: {
  entityType: IndexableEntityType;
  entityId: string;
  fn: () => Promise<T>;
}): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${args.entityType}), hashtext(${args.entityId}))`,
    );
    return await args.fn();
  });
}
