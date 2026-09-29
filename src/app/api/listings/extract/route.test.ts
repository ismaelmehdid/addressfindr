import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/application/rate-limit/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
  applyDailyCap: vi.fn(),
}));

vi.mock('@/application/listing/extract-listing', () => ({
  extractListing: vi.fn(),
}));

import { extractListing } from '@/application/listing/extract-listing';
import { getCurrentUser } from '@/application/me/get-current-user';
import {
  applyDailyCap,
  applyRateLimit,
} from '@/application/rate-limit/apply-rate-limit';
import { unauthorized } from '@/core/errors';
import { POST } from './route';

const LISTING_URL = 'https://www.leboncoin.fr/ad/ventes_immobilieres/1';

function post(body: string, contentType = 'application/json'): Request {
  return new Request('https://app.test/api/listings/extract', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(err(unauthorized('no session')));
  vi.mocked(applyRateLimit).mockResolvedValue({
    success: true,
    remaining: 9,
    reset: 0,
  });
  vi.mocked(applyDailyCap).mockResolvedValue({
    success: true,
    remaining: 99,
    reset: 0,
  });
  vi.mocked(extractListing).mockResolvedValue(
    ok({ fields: {}, sources: {} } as never),
  );
});

// why: the daily cap is shared by every caller. A request that can never
// reach Firecrawl must not spend it, or one client could exhaust it for free.
describe('POST /api/listings/extract — daily cap', () => {
  it.each([
    ['a text/plain body', JSON.stringify({ url: LISTING_URL }), 'text/plain'],
    ['a body that is not JSON', 'x', 'application/json'],
    ['a body without a url', '{}', 'application/json'],
    ['a url that is not a link', '{"url":"x"}', 'application/json'],
    [
      'a url on an unsupported portal',
      '{"url":"https://example.com/ad/1"}',
      'application/json',
    ],
  ])('spends no daily token on %s', async (_, body, contentType) => {
    const response = await POST(post(body, contentType));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(applyDailyCap).not.toHaveBeenCalled();
    expect(extractListing).not.toHaveBeenCalled();
  });

  it('spends one daily token, then extracts', async () => {
    const response = await POST(post(JSON.stringify({ url: LISTING_URL })));

    expect(response.status).toBe(200);
    expect(applyDailyCap).toHaveBeenCalledExactlyOnceWith({
      bucket: 'listing-extract',
    });
    expect(vi.mocked(applyDailyCap).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(extractListing).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('does not extract once the daily cap is spent', async () => {
    vi.mocked(applyDailyCap).mockResolvedValue({
      success: false,
      reason: 'limited',
      reset: 42,
    });

    const response = await POST(post(JSON.stringify({ url: LISTING_URL })));

    expect(response.status).toBe(429);
    expect(extractListing).not.toHaveBeenCalled();
  });
});
