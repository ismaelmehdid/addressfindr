import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { cookies } from 'next/headers';
import { requireOrganizationScope } from '@/application/me/organization-scope';
import { isDevPaywallSkipEnabled } from '@/core/billing/services/dev-paywall-skip';
import {
  DEV_PAYWALL_SKIP_COOKIE,
  type Entitlement,
} from '@/core/billing/types/entitlement';
import type { AppError } from '@/core/errors';
import { autumnBillingAdapter } from '@/infra/external-apis/autumn/autumn-billing-adapter';
import { env } from '@/shared/env';

// Whole-app entitlement for the current user's active organization.
// Order matters: the dev skip short-circuits before any Autumn call so local
// development works without a billing account.
export async function getAppEntitlement(): Promise<
  Result<Entitlement, AppError>
> {
  const scope = await requireOrganizationScope();
  if (scope.isErr()) return err(scope.error);

  const cookieStore = await cookies();
  const skipEnabled = isDevPaywallSkipEnabled({
    vercelEnv: env().VERCEL_ENV,
    skipCookieValue: cookieStore.get(DEV_PAYWALL_SKIP_COOKIE)?.value,
  });
  if (skipEnabled) return ok({ allowed: true, reason: 'dev_skip' });

  return autumnBillingAdapter.checkAppAccess({
    organizationId: scope.value.organizationId,
  });
}
