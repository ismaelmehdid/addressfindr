import { beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_ENV = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/app',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_abc',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
  SUPABASE_STORAGE_BUCKET: 'files',
  ZEROENTROPY_API_URL: 'https://api.zeroentropy.dev/v1',
  CRON_SECRET: 'z'.repeat(16),
};

async function loadEnv(overrides: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'test');
  for (const [key, value] of Object.entries({
    ...REQUIRED_ENV,
    ...overrides,
  })) {
    vi.stubEnv(key, value);
  }
  const { env } = await import('./env');
  return env;
}

describe('env email provider', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('boots with EMAIL_PROVIDER=none and no credentials', async () => {
    const env = await loadEnv({ EMAIL_PROVIDER: 'none' });
    expect(env().EMAIL_PROVIDER).toBe('none');
  });

  it('rejects EMAIL_PROVIDER=smtp without credentials', async () => {
    const env = await loadEnv({ EMAIL_PROVIDER: 'smtp' });
    expect(() => env()).toThrow(/EMAIL_PROVIDER=smtp requires/);
  });

  it('rejects EMAIL_PROVIDER=resend without credentials', async () => {
    const env = await loadEnv({ EMAIL_PROVIDER: 'resend' });
    expect(() => env()).toThrow(/EMAIL_PROVIDER=resend requires/);
  });
});

describe('env empty values', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('treats an empty optional value as unset rather than invalid', async () => {
    const env = await loadEnv({
      EMAIL_PROVIDER: 'none',
      OPENAI_API_KEY: '',
      ZEROENTROPY_API_KEY: '',
      NEXT_PUBLIC_POSTHOG_KEY: '',
      SUPABASE_STORAGE_HOST: '',
      RESEND_FROM_EMAIL: '',
    });
    expect(() => env()).not.toThrow();
    expect(env().OPENAI_API_KEY).toBeUndefined();
    expect(env().SUPABASE_STORAGE_HOST).toBeUndefined();
  });

  it('falls back to the default when an optional value is empty', async () => {
    const env = await loadEnv({ EMAIL_PROVIDER: 'none', CHAT_MODEL: '' });
    expect(env().CHAT_MODEL).toBe('gpt-5.4-mini');
  });

  it('still rejects an empty required value', async () => {
    const env = await loadEnv({ EMAIL_PROVIDER: 'none', DATABASE_URL: '' });
    expect(() => env()).toThrow(/DATABASE_URL/);
  });
});
