import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({
    NODE_ENV: 'test',
    VERCEL_ENV: 'development',
    GEO_GOUV_BASE_URL: 'https://geo.api.gouv.fr',
    GEO_GOUV_TIMEOUT_MS: 8000,
  }),
}));

import { geoGouvCommuneDirectory } from './geo-gouv-commune-directory';

function mockFetchOnce(body: unknown, status = 200) {
  const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function calledUrl(spy: ReturnType<typeof mockFetchOnce>): URL {
  const [first] = spy.mock.calls[0] as unknown as [URL];
  return first;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geoGouvCommuneDirectory.findByPostalCode', () => {
  it('asks for arrondissements as well as communes', async () => {
    const spy = mockFetchOnce([]);
    await geoGouvCommuneDirectory.findByPostalCode({ postalCode: '69003' });
    const url = calledUrl(spy);
    expect(url.searchParams.get('codePostal')).toBe('69003');
    expect(url.searchParams.get('type')).toBe(
      'commune-actuelle,arrondissement-municipal',
    );
  });

  it('flags the arrondissement and leaves the parent commune unflagged', async () => {
    mockFetchOnce([
      {
        nom: 'Lyon',
        code: '69123',
        codesPostaux: ['69003'],
        type: 'commune-actuelle',
      },
      {
        nom: 'Lyon 3e Arrondissement',
        code: '69383',
        codesPostaux: ['69003'],
        type: 'arrondissement-municipal',
      },
    ]);

    const result = await geoGouvCommuneDirectory.findByPostalCode({
      postalCode: '69003',
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([
      {
        inseeCode: '69123',
        name: 'Lyon',
        postalCodes: ['69003'],
        isArrondissement: false,
      },
      {
        inseeCode: '69383',
        name: 'Lyon 3e Arrondissement',
        postalCodes: ['69003'],
        isArrondissement: true,
      },
    ]);
  });

  it('keeps a Corsican code intact', async () => {
    mockFetchOnce([
      {
        nom: 'Ajaccio',
        code: '2A004',
        codesPostaux: ['20000'],
        type: 'commune-actuelle',
      },
    ]);

    const result = await geoGouvCommuneDirectory.findByPostalCode({
      postalCode: '20000',
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value[0]?.inseeCode).toBe('2A004');
  });

  it('returns an external_api error on a server failure', async () => {
    mockFetchOnce({}, 500);
    const result = await geoGouvCommuneDirectory.findByPostalCode({
      postalCode: '69003',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });

  it('rejects a response whose shape is not the expected list', async () => {
    mockFetchOnce({ nom: 'Lyon' });
    const result = await geoGouvCommuneDirectory.findByPostalCode({
      postalCode: '69003',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });
});

describe('geoGouvCommuneDirectory.findByInseeCode', () => {
  it('returns null on 404 rather than an error', async () => {
    mockFetchOnce({}, 404);
    const result = await geoGouvCommuneDirectory.findByInseeCode({
      inseeCode: '99999',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBeNull();
  });

  it('reads a single commune', async () => {
    mockFetchOnce({
      nom: 'Lyon 3e Arrondissement',
      code: '69383',
      codesPostaux: ['69003'],
      type: 'arrondissement-municipal',
    });
    const result = await geoGouvCommuneDirectory.findByInseeCode({
      inseeCode: '69383',
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value?.isArrondissement).toBe(true);
  });
});
