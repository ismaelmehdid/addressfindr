import 'server-only';

import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import { hasRedeemedCode as hasRedeemedCodeInRepo } from '@/infra/data-access/early-access/early-access-repo';

export async function hasRedeemedCode(args: {
  userId: string;
}): Promise<Result<boolean, AppError>> {
  return hasRedeemedCodeInRepo(args);
}
