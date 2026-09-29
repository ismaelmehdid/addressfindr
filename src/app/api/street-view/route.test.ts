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

vi.mock('@/application/street-view/get-street-view-image', () => ({
  getStreetViewImage: vi.fn(),
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import {
  applyDailyCap,
  applyRateLimit,
} from '@/application/rate-limit/apply-rate-limit';
import { getStreetViewImage } from '@/application/street-view/get-street-view-image';
import { unauthorized } from '@/core/errors';
import { GET } from './route';

function photo(query: string): Request {
  return new Request(`https://app.test/api/street-view?${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(err(unauthorized('no session')));
  vi.mocked(applyRateLimit).mockResolvedValue({
    success: true,
    remaining: 59,
    reset: 0,
  });
  vi.mocked(applyDailyCap).mockResolvedValue({
    success: true,
    remaining: 999,
    reset: 0,
  });
  vi.mocked(getStreetViewImage).mockResolvedValue(
    ok({ bytes: new ArrayBuffer(1), contentType: 'image/jpeg' }),
  );
});

// why: the daily cap is shared by every caller. A point that can never reach
// Google must not spend it, or one client could exhaust it for free.
describe('GET /api/street-view — daily cap', () => {
  it.each([
    ['no coordinates', ''],
    ['a coordinate that is not a number', 'lat=abc&lon=4.86'],
    ['a point off the coast of Africa', 'lat=0&lon=0'],
    ['a point outside metropolitan France', 'lat=40.71&lon=-74.0'],
  ])('spends no daily token on %s', async (_, query) => {
    const response = await GET(photo(query));

    expect(response.status).toBe(400);
    expect(applyDailyCap).not.toHaveBeenCalled();
    expect(getStreetViewImage).not.toHaveBeenCalled();
  });

  it('spends one daily token, then fetches the photo', async () => {
    const response = await GET(photo('lat=45.75&lon=4.86'));

    expect(response.status).toBe(200);
    expect(applyDailyCap).toHaveBeenCalledExactlyOnceWith({
      bucket: 'street-view',
    });
    expect(getStreetViewImage).toHaveBeenCalledWith({
      lat: '45.75',
      lon: '4.86',
    });
    expect(vi.mocked(applyDailyCap).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getStreetViewImage).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('does not fetch once the daily cap is spent', async () => {
    vi.mocked(applyDailyCap).mockResolvedValue({
      success: false,
      reason: 'limited',
      reset: 42,
    });

    const response = await GET(photo('lat=45.75&lon=4.86'));

    expect(response.status).toBe(429);
    expect(getStreetViewImage).not.toHaveBeenCalled();
  });
});
