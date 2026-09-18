import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, unknown } from '@/core/errors';
import { db } from '@/infra/database/connection';
import { earlyAccessCode } from '@/infra/database/schema/early-access-schema';
import { log } from '@/shared/logger';

export async function claimCode(args: {
  codeHash: string;
  userId: string;
}): Promise<Result<boolean, AppError>> {
  try {
    const [claimed] = await db
      .update(earlyAccessCode)
      .set({ usedBy: args.userId, usedAt: new Date() })
      .where(
        and(
          eq(earlyAccessCode.codeHash, args.codeHash),
          isNull(earlyAccessCode.usedBy),
        ),
      )
      .returning({ id: earlyAccessCode.id });
    return ok(Boolean(claimed));
  } catch (e) {
    log.error('early_access.claim_code.failed', e, { userId: args.userId });
    return err(unknown('Failed to claim early-access code'));
  }
}
