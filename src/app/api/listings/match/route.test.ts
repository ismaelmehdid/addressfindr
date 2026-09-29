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

vi.mock('@/application/ademe/find-address-candidates', () => ({
  findAddressCandidates: vi.fn(),
}));

import { findAddressCandidates } from '@/application/ademe/find-address-candidates';
import { getCurrentUser } from '@/application/me/get-current-user';
import {
  applyDailyCap,
  applyRateLimit,
} from '@/application/rate-limit/apply-rate-limit';
import { unauthorized } from '@/core/errors';
import { POST } from './route';

const FIELDS = {
  listingId: null,
  transactionType: null,
  propertyType: 'apartment',
  surfaceM2: 63,
  landSurfaceM2: null,
  rooms: null,
  bedrooms: null,
  floor: null,
  buildingFloors: null,
  yearBuilt: null,
  dpeClass: 'D',
  gesClass: null,
  dpeKwhM2Year: null,
  gesKgCo2M2Year: null,
  heatingEnergy: null,
  annualEnergyCostMinEur: null,
  annualEnergyCostMaxEur: null,
  dpeDate: null,
  city: 'Lyon',
  postalCode: '69003',
  inseeCode: null,
  streetAddress: null,
  priceEur: null,
  publishedAt: null,
  portal: 'leboncoin',
  canonicalUrl: 'https://www.leboncoin.fr/ad/ventes_immobilieres/1',
  pin: null,
};

const SOURCES = Object.fromEntries(
  Object.keys(FIELDS)
    .filter(
      (key) => key !== 'portal' && key !== 'canonicalUrl' && key !== 'pin',
    )
    .map((key) => [key, 'absent']),
);

function post(body: string, contentType = 'application/json'): Request {
  return new Request('https://app.test/api/listings/match', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

const VALID_BODY = JSON.stringify({
  listing: { fields: FIELDS, sources: SOURCES },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(err(unauthorized('no session')));
  vi.mocked(applyRateLimit).mockResolvedValue({
    success: true,
    remaining: 19,
    reset: 0,
  });
  vi.mocked(applyDailyCap).mockResolvedValue({
    success: true,
    remaining: 499,
    reset: 0,
  });
  vi.mocked(findAddressCandidates).mockResolvedValue(ok({} as never));
});

// why: the daily cap is shared by every caller. A request that can never
// reach ADEME must not spend it, or one client could exhaust it for free.
describe('POST /api/listings/match — daily cap', () => {
  it.each([
    ['a text/plain body', VALID_BODY, 'text/plain'],
    ['a body that is not JSON', 'x', 'application/json'],
    ['a body without a listing', '{}', 'application/json'],
    [
      'a listing that fails the schema',
      JSON.stringify({
        listing: { fields: { ...FIELDS, surfaceM2: -5 }, sources: SOURCES },
      }),
      'application/json',
    ],
  ])('spends no daily token on %s', async (_, body, contentType) => {
    const response = await POST(post(body, contentType));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(applyDailyCap).not.toHaveBeenCalled();
    expect(findAddressCandidates).not.toHaveBeenCalled();
  });

  it('spends one daily token, then matches', async () => {
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(200);
    expect(applyDailyCap).toHaveBeenCalledExactlyOnceWith({
      bucket: 'listing-match',
    });
    expect(vi.mocked(applyDailyCap).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(findAddressCandidates).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('does not match once the daily cap is spent', async () => {
    vi.mocked(applyDailyCap).mockResolvedValue({
      success: false,
      reason: 'limited',
      reset: 42,
    });

    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(429);
    expect(findAddressCandidates).not.toHaveBeenCalled();
  });
});
