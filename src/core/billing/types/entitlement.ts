// The boolean feature that a paid plan grants; the whole app is gated on it.
// Must match the feature id defined in autumn.config.ts.
export const APP_ACCESS_FEATURE_ID = 'app_access';

// Dev-only escape hatch: a cookie that lets a developer bypass the paywall when
// not running in production. Set by the set-dev-paywall-skip action, read by the
// entitlement use case. Honored only outside production (see dev-paywall-skip).
export const DEV_PAYWALL_SKIP_COOKIE = 'dev_paywall_skip';
export const DEV_PAYWALL_SKIP_VALUE = '1';

export type EntitlementReason =
  | 'entitled'
  | 'dev_skip'
  | 'not_entitled'
  | 'billing_unconfigured';

export type Entitlement = {
  allowed: boolean;
  reason: EntitlementReason;
};
