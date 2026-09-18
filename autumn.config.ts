import { feature, item, plan } from 'atmn';

// Pricing model for the boilerplate: a hard paywall on the whole app.
// `app_access` is a boolean feature that only the paid plan grants; the app's
// entitlement gate checks it. Retune tiers/prices here, then `pnpm dlx atmn push`.

export const appAccess = feature({
  id: 'app_access',
  name: 'App access',
  type: 'boolean',
});

// Baseline auto-enabled plan. It does NOT include app_access, so a brand-new
// organization is signed up but still behind the paywall until it upgrades.
export const free = plan({
  id: 'free',
  name: 'Free',
  autoEnable: true,
  items: [],
});

// Paid plan that unlocks the app.
export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 20, interval: 'month' },
  items: [item({ featureId: appAccess.id })],
});
