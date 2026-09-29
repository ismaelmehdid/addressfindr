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

  it('defaults to none so a machine with no mail credentials boots', async () => {
    const env = await loadEnv({});
    expect(() => env()).not.toThrow();
    expect(env().EMAIL_PROVIDER).toBe('none');
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

describe('env optional infrastructure values', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('boots without a storage bucket, a zeroentropy url or a cron secret', async () => {
    const env = await loadEnv({ EMAIL_PROVIDER: 'none' });
    expect(() => env()).not.toThrow();
    expect(env().SUPABASE_STORAGE_BUCKET).toBe('files');
    expect(env().ZEROENTROPY_API_URL).toBe('https://eu-api.zeroentropy.dev/v1');
    expect(env().CRON_SECRET).toBeUndefined();
  });

  it('still rejects a cron secret shorter than 16 characters', async () => {
    const env = await loadEnv({ EMAIL_PROVIDER: 'none', CRON_SECRET: 'short' });
    expect(() => env()).toThrow(/CRON_SECRET/);
  });
});

describe('env Street View embed key', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('treats an empty embed key as unset', async () => {
    const env = await loadEnv({
      EMAIL_PROVIDER: 'none',
      NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY: '',
    });
    expect(env().NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY).toBeUndefined();
  });

  it('accepts a browser key distinct from the server key', async () => {
    const env = await loadEnv({
      EMAIL_PROVIDER: 'none',
      GOOGLE_MAPS_API_KEY: 'server-street-view-key',
      NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY: 'browser-embed-key',
    });
    expect(env().NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY).toBe(
      'browser-embed-key',
    );
  });

  it('refuses to serve the server Street View key to the browser', async () => {
    const env = await loadEnv({
      EMAIL_PROVIDER: 'none',
      GOOGLE_MAPS_API_KEY: 'server-street-view-key',
      NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY: 'server-street-view-key',
    });
    expect(() => env()).toThrow(/NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY/);
  });
});

describe('env daily caps on paid routes', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to 100 extractions, 500 matches and 1000 photos a day', async () => {
    const env = await loadEnv({ EMAIL_PROVIDER: 'none' });
    expect(env().RATE_LIMIT_DAILY_LISTING_EXTRACT).toBe(100);
    expect(env().RATE_LIMIT_DAILY_LISTING_MATCH).toBe(500);
    expect(env().RATE_LIMIT_DAILY_STREET_VIEW).toBe(1000);
  });

  it('reads an override as a number', async () => {
    const env = await loadEnv({
      EMAIL_PROVIDER: 'none',
      RATE_LIMIT_DAILY_LISTING_EXTRACT: '40',
    });
    expect(env().RATE_LIMIT_DAILY_LISTING_EXTRACT).toBe(40);
  });

  it('rejects a cap that is not a number', async () => {
    const env = await loadEnv({
      EMAIL_PROVIDER: 'none',
      RATE_LIMIT_DAILY_STREET_VIEW: 'lots',
    });
    expect(() => env()).toThrow(/RATE_LIMIT_DAILY_STREET_VIEW/);
  });

  it('rejects a cap of zero', async () => {
    const env = await loadEnv({
      EMAIL_PROVIDER: 'none',
      RATE_LIMIT_DAILY_LISTING_MATCH: '0',
    });
    expect(() => env()).toThrow(/RATE_LIMIT_DAILY_LISTING_MATCH/);
  });
});
