import 'server-only';

import * as v from 'valibot';
import { getCurrentUser } from '@/application/me/get-current-user';
import { createOrganizationWithOwner } from '@/application/organization/create-organization-with-owner';
import { setActiveOrganizationOnSession } from '@/infra/auth/active-organization';
import { claimCode } from '@/infra/data-access/early-access/early-access-repo';
import { hashEarlyAccessCode } from '@/shared/early-access-hash';
import { log } from '@/shared/logger';
import { newId } from '@/shared/utils/id';

const InputSchema = v.object({
  code: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  organizationName: v.pipe(v.string(), v.minLength(2), v.maxLength(100)),
});

export type RedeemInput = v.InferInput<typeof InputSchema>;
export type RedeemResult =
  | { success: true; organizationId: string }
  | {
      success: false;
      error:
        | 'unauthenticated'
        | 'already_in_org'
        | 'invalid_input'
        | 'invalid_code'
        | 'unknown';
    };

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'org'}-${Date.now().toString(36)}`;
}

export async function redeem(input: RedeemInput): Promise<RedeemResult> {
  const parsed = v.safeParse(InputSchema, input);
  if (!parsed.success) return { success: false, error: 'invalid_input' };

  const currentUser = await getCurrentUser();
  if (currentUser.isErr()) return { success: false, error: 'unauthenticated' };

  const me = currentUser.value;
  if (me.organizationId) return { success: false, error: 'already_in_org' };

  const codeHash = hashEarlyAccessCode(parsed.output.code);
  const orgId = newId();

  const claimed = await claimCode({ codeHash, userId: me.id });
  if (claimed.isErr()) return { success: false, error: 'unknown' };
  if (!claimed.value) {
    log.warn('Invalid early-access code', { userId: me.id });
    return { success: false, error: 'invalid_code' };
  }

  // The claim and the org provisioning are separate domain transactions: if
  // provisioning fails the code stays burned. Accepted trade-off — a fresh
  // code can be issued, while cross-domain writes stay behind entry points.
  const created = await createOrganizationWithOwner({
    organizationId: orgId,
    name: parsed.output.organizationName,
    slug: slugify(parsed.output.organizationName),
    ownerUserId: me.id,
  });
  if (created.isErr()) {
    log.error(
      'Early access redemption failed after code claim',
      new Error(created.error.message),
      { userId: me.id, organizationId: orgId },
    );
    return { success: false, error: 'unknown' };
  }

  const activated = await setActiveOrganizationOnSession({
    sessionId: me.sessionId,
    organizationId: orgId,
  });
  if (activated.isErr()) {
    // Org exists and membership is in place; session pickup happens on next
    // sign-in. Do not fail the redemption for this.
    log.warn('early_access.activate_session_failed', {
      userId: me.id,
      organizationId: orgId,
    });
  }

  log.info('Early access redeemed', {
    userId: me.id,
    organizationId: orgId,
  });

  return { success: true, organizationId: orgId };
}
