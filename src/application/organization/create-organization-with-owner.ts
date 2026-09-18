import 'server-only';

import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import { createOrganizationWithOwner as createInRepo } from '@/infra/data-access/organization/organization-repo';
import { log } from '@/shared/logger';

export async function createOrganizationWithOwner(args: {
  organizationId: string;
  name: string;
  slug: string;
  ownerUserId: string;
}): Promise<Result<void, AppError>> {
  const created = await createInRepo(args);
  if (created.isOk()) {
    log.info('organization.created', {
      organizationId: args.organizationId,
      ownerUserId: args.ownerUserId,
    });
  }
  return created;
}
