import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/application/me/get-current-user';
import { type AppError, forbidden, unknown } from '@/core/errors';
import { auth } from '@/infra/auth/auth';
import { log } from '@/shared/logger';
import type { OrganizationMemberDto, OrganizationRole } from './dto';
import { getMembership } from './get-membership';

function normalizeRole(role: string): OrganizationRole {
  if (role === 'owner' || role === 'admin') return role;
  return 'member';
}

export async function listOrganizationMembers(): Promise<
  Result<OrganizationMemberDto[], AppError>
> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);
  const membership = await getMembership(me.value.id);
  if (membership.isErr()) return err(membership.error);
  if (!membership.value) {
    return err(forbidden('No active organization'));
  }
  try {
    const result = await auth.api.listMembers({
      query: { organizationId: membership.value.organizationId },
      headers: await headers(),
    });
    const items = result.members ?? [];
    return ok(
      items.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user?.email ?? '',
        name: m.user?.name ?? '',
        image: m.user?.image ?? null,
        role: normalizeRole(m.role),
        createdAt:
          m.createdAt instanceof Date
            ? m.createdAt.toISOString()
            : new Date(m.createdAt).toISOString(),
      })),
    );
  } catch (e) {
    log.error('organization.listMembers failure', e);
    return err(unknown('Failed to list members'));
  }
}
