import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: vi.fn(),
}));

vi.mock('@/application/zeroentropy/entity-sync-orchestrator', () => ({
  retryDueOperations: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from '@/app/api/cron/zeroentropy-retry/route';
import { retryDueOperations } from '@/application/zeroentropy/entity-sync-orchestrator';
import { env } from '@/shared/env';

const SECRET = 'c'.repeat(32);

const mockedEnv = vi.mocked(env);
const mockedRetry = vi.mocked(retryDueOperations);

function request(bearer: string | null): Request {
  return new Request('https://app.test/api/cron/zeroentropy-retry', {
    headers: bearer === null ? {} : { authorization: `Bearer ${bearer}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRetry.mockResolvedValue(ok({ retried: 0, failed: 0 } as never));
});

describe('GET /api/cron/zeroentropy-retry — authz gate', () => {
  it('rejects every caller when CRON_SECRET is not configured', async () => {
    mockedEnv.mockReturnValue({ CRON_SECRET: undefined } as never);

    const response = await GET(request(SECRET));

    expect(response.status).toBe(401);
    expect(mockedRetry).not.toHaveBeenCalled();
  });

  it('rejects an empty bearer token when CRON_SECRET is not configured', async () => {
    mockedEnv.mockReturnValue({ CRON_SECRET: undefined } as never);

    const response = await GET(request(''));

    expect(response.status).toBe(401);
    expect(mockedRetry).not.toHaveBeenCalled();
  });

  it('rejects a caller that sends no authorization header', async () => {
    mockedEnv.mockReturnValue({ CRON_SECRET: SECRET } as never);

    const response = await GET(request(null));

    expect(response.status).toBe(401);
    expect(mockedRetry).not.toHaveBeenCalled();
  });

  it('rejects a caller that sends the wrong secret', async () => {
    mockedEnv.mockReturnValue({ CRON_SECRET: SECRET } as never);

    const response = await GET(request('d'.repeat(32)));

    expect(response.status).toBe(401);
    expect(mockedRetry).not.toHaveBeenCalled();
  });

  it('accepts a caller that sends the configured secret', async () => {
    mockedEnv.mockReturnValue({ CRON_SECRET: SECRET } as never);

    const response = await GET(request(SECRET));

    expect(response.status).toBe(200);
    expect(mockedRetry).toHaveBeenCalledOnce();
  });
});
