import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/shared/env', () => ({
  env: () => ({
    VERCEL_ENV: 'production',
    NEXT_PUBLIC_APP_URL: 'https://app.test',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'https://app.test',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    MICROSOFT_CLIENT_ID: 'microsoft-client-id',
    MICROSOFT_CLIENT_SECRET: 'microsoft-client-secret',
    MICROSOFT_TENANT_ID: 'common',
  }),
}));

vi.mock('@/infra/database/connection', () => ({ db: {} }));

vi.mock('@/infra/database/schema/auth-schema', () => ({
  account: {},
  session: {},
  user: {},
  verification: {},
}));

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: vi.fn(() => ({})),
}));

vi.mock('better-auth', () => ({
  betterAuth: vi.fn(() => ({ handler: vi.fn() })),
}));

import { betterAuth } from 'better-auth';
import './auth';

function socialProvider(name: 'google' | 'microsoft'): unknown {
  const options = vi.mocked(betterAuth).mock.calls[0]?.[0];
  return options?.socialProviders?.[name];
}

// why: auth is dormant. An existing account may still sign in, but nobody can
// create one, through the OAuth redirect or through a client-side id token.
describe('auth — sign-up closed while dormant', () => {
  it.each([
    'google',
    'microsoft',
  ] as const)('refuses a new %s account on every sign-in path', (name) => {
    expect(socialProvider(name)).toMatchObject({
      disableSignUp: true,
      disableIdTokenSignIn: true,
    });
  });

  it('keeps email and password sign-up off', () => {
    const options = vi.mocked(betterAuth).mock.calls[0]?.[0];
    expect(options?.emailAndPassword).toEqual({ enabled: false });
  });
});
