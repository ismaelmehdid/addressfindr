import 'server-only';

import { eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, notFound, unknown } from '@/core/errors';
import { db } from '@/infra/database/connection';
import {
  member,
  organization,
} from '@/infra/database/schema/organization-schema';
import { log } from '@/shared/logger';

export async function getOrganizationName(
  organizationId: string,
): Promise<Result<string, AppError>> {
  try {
    const [row] = await db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    if (!row) return err(notFound('Organization not found', 'organization'));
    return ok(row.name);
  } catch (e) {
    log.error('Failed to fetch organization name', e, { organizationId });
    return err(unknown('Failed to fetch organization name'));
  }
}

export async function createOrganizationWithOwner(args: {
  organizationId: string;
  name: string;
  slug: string;
  ownerUserId: string;
}): Promise<Result<void, AppError>> {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(organization).values({
        id: args.organizationId,
        name: args.name,
        slug: args.slug,
      });
      await tx.insert(member).values({
        userId: args.ownerUserId,
        organizationId: args.organizationId,
        role: 'owner',
      });
    });
    return ok(undefined);
  } catch (e) {
    log.error('organization.create_with_owner.failed', e, {
      organizationId: args.organizationId,
      ownerUserId: args.ownerUserId,
    });
    return err(unknown('Failed to create organization'));
  }
}
