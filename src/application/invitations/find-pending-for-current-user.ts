import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/infra/auth/auth';
import { log } from '@/shared/logger';

export type PendingInvitation = {
  id: string;
  organizationName: string;
  email: string;
};

export async function findPendingInvitationForCurrentUser(): Promise<PendingInvitation | null> {
  try {
    const list = await auth.api.listUserInvitations({
      headers: await headers(),
    });
    if (!Array.isArray(list)) return null;
    const now = Date.now();
    const pending = list
      .filter((inv) => inv.status === 'pending')
      .filter((inv) => {
        const exp =
          inv.expiresAt instanceof Date
            ? inv.expiresAt.getTime()
            : new Date(inv.expiresAt).getTime();
        return Number.isFinite(exp) && exp > now;
      })
      .sort((a, b) => {
        const ea =
          a.expiresAt instanceof Date
            ? a.expiresAt.getTime()
            : new Date(a.expiresAt).getTime();
        const eb =
          b.expiresAt instanceof Date
            ? b.expiresAt.getTime()
            : new Date(b.expiresAt).getTime();
        return eb - ea;
      });
    const head = pending[0];
    if (!head) return null;
    return {
      id: head.id,
      organizationName: head.organizationName ?? '',
      email: head.email,
    };
  } catch (e) {
    log.warn('invitations.find_pending_for_user_failed', {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
