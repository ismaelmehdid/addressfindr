import 'server-only';

import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import {
  getMembershipForUser,
  type MembershipRecord,
} from '@/infra/data-access/organization/member-repo';

export async function getMembership(
  userId: string,
): Promise<Result<MembershipRecord | null, AppError>> {
  return getMembershipForUser(userId);
}
