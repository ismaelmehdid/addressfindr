import { cookies } from 'next/headers';
import {
  DEV_PAYWALL_SKIP_COOKIE,
  DEV_PAYWALL_SKIP_VALUE,
} from '@/core/billing/types/entitlement';
import { forbidden } from '@/core/errors';
import { env } from '@/shared/env';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

const DEV_PAYWALL_SKIP_MAX_AGE = 60 * 60 * 24 * 30;

// Dev-only: drop the paywall-skip cookie so the entitlement gate lets this
// browser through. Refuses in production so the escape hatch can never ship live
// (the button that calls this is also hidden in production).
export async function POST(): Promise<Response> {
  if (env().VERCEL_ENV === 'production') {
    log.warn('api.billing.dev_paywall_skip.refused_in_production');
    return jsonError(forbidden('Not available in production'));
  }

  const store = await cookies();
  store.set(DEV_PAYWALL_SKIP_COOKIE, DEV_PAYWALL_SKIP_VALUE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DEV_PAYWALL_SKIP_MAX_AGE,
  });

  log.info('api.billing.dev_paywall_skip.success');
  return new Response(null, { status: 204 });
}
