import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/application/me/get-current-user';
import { type AppError, forbidden, unknown } from '@/core/errors';
import { auth } from '@/infra/auth/auth';
import { log } from '@/shared/logger';
import type { OrganizationInvitationDto, OrganizationRole } from './dto';

function normalizeRole(role: string): OrganizationRole {
  if (role === 'owner' || role === 'admin') return role;
  return 'member';
}

export async function listOrganizationInvitations(): Promise<
  Result<OrganizationInvitationDto[], AppError>
> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);
  if (!me.value.organizationId) {
    return err(forbidden('No active organization'));
  }
  try {
    const items = await auth.api.listInvitations({
      query: { organizationId: me.value.organizationId },
      headers: await headers(),
    });
    const pending = (items ?? []).filter((inv) => inv.status === 'pending');
    return ok(
      pending.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: normalizeRole(inv.role ?? 'member'),
        status: inv.status,
        expiresAt:
          inv.expiresAt instanceof Date
            ? inv.expiresAt.toISOString()
            : new Date(inv.expiresAt).toISOString(),
        inviterId: inv.inviterId,
        createdAt: new Date().toISOString(),
      })),
    );
  } catch (e) {
    log.error('organization.listInvitations failure', e);
    return err(unknown('Failed to list invitations'));
  }
}
