import { describe, expect, it } from 'vitest';
import { isDevPaywallSkipEnabled } from './dev-paywall-skip';

describe('isDevPaywallSkipEnabled', () => {
  it('allows the skip in development when the cookie is set', () => {
    expect(
      isDevPaywallSkipEnabled({
        vercelEnv: 'development',
        skipCookieValue: '1',
      }),
    ).toBe(true);
  });

  it('allows the skip in preview when the cookie is set', () => {
    expect(
      isDevPaywallSkipEnabled({ vercelEnv: 'preview', skipCookieValue: '1' }),
    ).toBe(true);
  });

  it('never allows the skip in production, even with the cookie set', () => {
    expect(
      isDevPaywallSkipEnabled({
        vercelEnv: 'production',
        skipCookieValue: '1',
      }),
    ).toBe(false);
  });

  it('denies the skip when the cookie is absent', () => {
    expect(
      isDevPaywallSkipEnabled({
        vercelEnv: 'development',
        skipCookieValue: undefined,
      }),
    ).toBe(false);
  });

  it('denies the skip when the cookie has an unexpected value', () => {
    expect(
      isDevPaywallSkipEnabled({
        vercelEnv: 'development',
        skipCookieValue: '0',
      }),
    ).toBe(false);
  });
});
