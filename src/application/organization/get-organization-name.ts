import 'server-only';

import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import { getOrganizationName as getFromRepo } from '@/infra/data-access/organization/organization-repo';

export async function getOrganizationName(
  organizationId: string,
): Promise<Result<string, AppError>> {
  return getFromRepo(organizationId);
}
