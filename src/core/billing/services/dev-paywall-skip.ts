import { DEV_PAYWALL_SKIP_VALUE } from '../types/entitlement';

// Pure decision: is the dev paywall-skip active? True only when we are NOT in a
// production Vercel environment AND the skip cookie carries the expected value.
// Keeping this pure makes the "never in production" invariant trivially testable.
export function isDevPaywallSkipEnabled(input: {
  vercelEnv: string;
  skipCookieValue: string | undefined;
}): boolean {
  return (
    input.vercelEnv !== 'production' &&
    input.skipCookieValue === DEV_PAYWALL_SKIP_VALUE
  );
}
