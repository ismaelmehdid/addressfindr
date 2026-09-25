import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({
    NODE_ENV: 'test',
    VERCEL_ENV: 'development',
    GEOCODER_BASE_URL: 'https://data.geopf.fr/geocodage',
    GEOCODER_TIMEOUT_MS: 5000,
  }),
}));

import { banGeocoder } from './ban-geocoder';

function mockFetchOnce(body: unknown, status = 200) {
  const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const FEATURE = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-1.531005, 47.188523] },
  properties: {
    label: '77 Route de Vertou 44200 Nantes',
    score: 0.79,
    housenumber: '77',
    id: '44109_8392_00077',
    name: '77 Route de Vertou',
    postcode: '44200',
    citycode: '44109',
    city: 'Nantes',
    type: 'housenumber',
    street: 'Route de Vertou',
  },
};

describe('banGeocoder', () => {
  it('asks for the single best match of the query', async () => {
    const spy = mockFetchOnce({ type: 'FeatureCollection', features: [] });
    await banGeocoder.geocode({ query: '77 route de Vertou 44100 Nantes' });

    const [url] = spy.mock.calls[0] as unknown as [URL];
    expect(url.pathname).toBe('/geocodage/search');
    expect(url.searchParams.get('q')).toBe('77 route de Vertou 44100 Nantes');
    expect(url.searchParams.get('limit')).toBe('1');
  });

  it('maps the best feature, reading coordinates as longitude then latitude', async () => {
    mockFetchOnce({ type: 'FeatureCollection', features: [FEATURE] });
    const result = await banGeocoder.geocode({ query: 'q' });
    expect(result._unsafeUnwrap()).toEqual({
      label: '77 Route de Vertou 44200 Nantes',
      houseNumber: '77',
      street: 'Route de Vertou',
      postalCode: '44200',
      city: 'Nantes',
      inseeCode: '44109',
      banId: '44109_8392_00077',
      kind: 'housenumber',
      score: 0.79,
      point: { latitude: 47.188523, longitude: -1.531005 },
    });
  });

  it('answers null when nothing matched', async () => {
    mockFetchOnce({ type: 'FeatureCollection', features: [] });
    const result = await banGeocoder.geocode({ query: 'q' });
    expect(result._unsafeUnwrap()).toBeNull();
  });

  it('maps a server failure to external_api', async () => {
    mockFetchOnce({ message: 'boom' }, 503);
    const result = await banGeocoder.geocode({ query: 'q' });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });

  it('maps an unexpected payload to external_api', async () => {
    mockFetchOnce({ type: 'FeatureCollection', features: [{ nope: true }] });
    const result = await banGeocoder.geocode({ query: 'q' });
    expect(result.isErr()).toBe(true);
  });

  it('refuses an empty query without calling out', async () => {
    const spy = mockFetchOnce({ type: 'FeatureCollection', features: [] });
    const result = await banGeocoder.geocode({ query: '   ' });
    expect(result.isErr()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
