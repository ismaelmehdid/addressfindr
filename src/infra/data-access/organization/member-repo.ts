import 'server-only';

import { eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, unknown } from '@/core/errors';
import { db } from '@/infra/database/connection';
import { member } from '@/infra/database/schema/organization-schema';
import { log } from '@/shared/logger';

export type MembershipRecord = {
  organizationId: string;
  role: string;
};

export async function getMembershipForUser(
  userId: string,
): Promise<Result<MembershipRecord | null, AppError>> {
  try {
    const [row] = await db
      .select({ organizationId: member.organizationId, role: member.role })
      .from(member)
      .where(eq(member.userId, userId))
      .limit(1);
    return ok(row ?? null);
  } catch (e) {
    log.error('organization.membership.lookup_failed', e, { userId });
    return err(unknown('Failed to look up membership'));
  }
}
