import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/application/rate-limit/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock('@/application/early-access/redeem', () => ({
  redeem: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from '@/app/api/early-access/redeem/route';
import { redeem } from '@/application/early-access/redeem';
import { getCurrentUser } from '@/application/me/get-current-user';
import { applyRateLimit } from '@/application/rate-limit/apply-rate-limit';
import { unauthorized } from '@/core/errors';

const mockedUser = vi.mocked(getCurrentUser);
const mockedRateLimit = vi.mocked(applyRateLimit);
const mockedRedeem = vi.mocked(redeem);

function request(body: unknown): Request {
  return new Request('http://localhost/api/early-access/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { code: 'CODE-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockedUser.mockResolvedValue(
    ok({
      id: 'user-1',
      sessionId: 'session-1',
    }) as unknown as Awaited<ReturnType<typeof getCurrentUser>>,
  );
  mockedRateLimit.mockResolvedValue({
    success: true,
    reset: 0,
  } as unknown as Awaited<ReturnType<typeof applyRateLimit>>);
  mockedRedeem.mockResolvedValue({ success: true });
});

describe('POST /api/early-access/redeem', () => {
  it('returns 200 on success', async () => {
    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  });

  it('returns 401 without calling redeem when unauthenticated', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('nope')));

    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(401);
    expect(mockedRedeem).not.toHaveBeenCalled();
  });

  it('returns 429 without calling redeem when rate limited', async () => {
    mockedRateLimit.mockResolvedValue({
      success: false,
      reset: 123,
    } as unknown as Awaited<ReturnType<typeof applyRateLimit>>);

    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(429);
    expect(mockedRedeem).not.toHaveBeenCalled();
  });

  it('rejects a malformed body before reaching redeem', async () => {
    const res = await POST(request({ code: 123 }));

    expect(res.status).toBe(400);
    expect(mockedRedeem).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid_code', 400],
    ['invalid_input', 400],
    ['unauthenticated', 401],
    ['unknown', 500],
  ] as const)('maps the %s outcome to HTTP %i', async (reason, status) => {
    mockedRedeem.mockResolvedValue({ success: false, error: reason });

    const res = await POST(request(VALID_BODY));

    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: reason,
    });
  });
});
