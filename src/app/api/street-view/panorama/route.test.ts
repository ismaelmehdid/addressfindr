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

vi.mock('@/application/street-view/get-street-view-panorama', () => ({
  getStreetViewPanorama: vi.fn(),
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import {
  applyDailyCap,
  applyRateLimit,
} from '@/application/rate-limit/apply-rate-limit';
import { getStreetViewPanorama } from '@/application/street-view/get-street-view-panorama';
import { unauthorized, validation } from '@/core/errors';
import { GET } from './route';

function lookup(query: string, headers: HeadersInit = {}): Request {
  return new Request(`https://app.test/api/street-view/panorama?${query}`, {
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(err(unauthorized('no session')));
  vi.mocked(applyRateLimit).mockResolvedValue({
    success: true,
    remaining: 59,
    reset: 0,
  });
  vi.mocked(getStreetViewPanorama).mockResolvedValue(
    ok({ panoId: 'pano-1', heading: 87 }),
  );
});

// why: the lookup only calls Google's free metadata endpoint, so it must never
// spend the daily cap that protects the billed photos.
describe('GET /api/street-view/panorama', () => {
  it('answers the panorama without spending the daily cap', async () => {
    const response = await GET(lookup('lat=45.75&lon=4.86'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ panoId: 'pano-1', heading: 87 });
    expect(getStreetViewPanorama).toHaveBeenCalledExactlyOnceWith({
      lat: '45.75',
      lon: '4.86',
    });
    expect(applyDailyCap).not.toHaveBeenCalled();
  });

  it('refuses a cross-site call before looking anything up', async () => {
    const response = await GET(
      lookup('lat=45.75&lon=4.86', { 'sec-fetch-site': 'cross-site' }),
    );

    expect(response.status).toBe(403);
    expect(getStreetViewPanorama).not.toHaveBeenCalled();
  });

  it('answers 400 for a point the use case rejects', async () => {
    vi.mocked(getStreetViewPanorama).mockResolvedValue(
      err(validation('Invalid Street View point')),
    );

    const response = await GET(lookup('lat=abc&lon=4.86'));

    expect(response.status).toBe(400);
    expect(applyDailyCap).not.toHaveBeenCalled();
  });

  it('answers 404 when no panorama is near the point', async () => {
    vi.mocked(getStreetViewPanorama).mockResolvedValue(ok(null));

    const response = await GET(lookup('lat=45.75&lon=4.86'));

    expect(response.status).toBe(404);
  });
});
