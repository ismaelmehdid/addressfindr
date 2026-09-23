import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({
    NODE_ENV: 'test',
    VERCEL_ENV: 'development',
    BDNB_BASE_URL: 'https://api.bdnb.io',
    BDNB_TIMEOUT_MS: 10000,
  }),
}));

import { bdnbBuildingDirectory } from './bdnb-building-directory';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function mockTwoHops(
  relations: unknown[],
  buildings: unknown[],
): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (url: URL) =>
    url.pathname.includes('rel_batiment_groupe_adresse')
      ? jsonResponse(relations)
      : jsonResponse(buildings),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bdnbBuildingDirectory.factsForAddresses', () => {
  it('walks address to building group to attributes', async () => {
    mockTwoHops(
      [
        {
          cle_interop_adr: '69383_4180_00016',
          batiment_groupe_id: 'bdnb-bg-AAAA',
        },
      ],
      [
        {
          batiment_groupe_id: 'bdnb-bg-AAAA',
          annee_construction: 1880,
          nb_niveau: 6,
        },
      ],
    );

    const result = await bdnbBuildingDirectory.factsForAddresses({
      banIds: ['69383_4180_00016'],
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([
      { banId: '69383_4180_00016', yearBuilt: 1880, floors: 6 },
    ]);
  });

  it('asks for nothing and calls nothing on an empty address list', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    const result = await bdnbBuildingDirectory.factsForAddresses({
      banIds: [],
    });

    expect(spy).not.toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual([]);
  });

  it('skips the second hop when no address resolved to a building', async () => {
    const spy = mockTwoHops([], []);
    const result = await bdnbBuildingDirectory.factsForAddresses({
      banIds: ['69383_9999_00001'],
    });

    expect(spy.mock.calls.length).toBe(1);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual([]);
  });

  // why: la BDNB ne rattache qu'une partie des adresses — 32% sur le releve du
  // 2026-09-22 a Lyon 3e. Une adresse inconnue est une absence, pas une erreur.
  it('returns facts only for the addresses it knows', async () => {
    mockTwoHops(
      [
        {
          cle_interop_adr: '69383_4180_00016',
          batiment_groupe_id: 'bdnb-bg-AAAA',
        },
      ],
      [
        {
          batiment_groupe_id: 'bdnb-bg-AAAA',
          annee_construction: 1880,
          nb_niveau: 6,
        },
      ],
    );

    const result = await bdnbBuildingDirectory.factsForAddresses({
      banIds: ['69383_4180_00016', '69383_0000_99999'],
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.map((f) => f.banId)).toEqual(['69383_4180_00016']);
  });

  it('keeps an address whose building states only one of the two values', async () => {
    mockTwoHops(
      [{ cle_interop_adr: '69383_4180_00016', batiment_groupe_id: 'bg' }],
      [
        {
          batiment_groupe_id: 'bg',
          annee_construction: null,
          nb_niveau: 6,
        },
      ],
    );

    const result = await bdnbBuildingDirectory.factsForAddresses({
      banIds: ['69383_4180_00016'],
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value[0]).toEqual({
      banId: '69383_4180_00016',
      yearBuilt: null,
      floors: 6,
    });
  });

  // why: l'enrichissement est un bonus. Une panne BDNB ne doit jamais faire
  // echouer une recherche d'adresse qui, sans elle, aboutissait.
  it('reports a failure rather than throwing when the API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    const result = await bdnbBuildingDirectory.factsForAddresses({
      banIds: ['69383_4180_00016'],
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });

  it('rejects a response whose shape is not the expected list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ oops: true })),
    );
    const result = await bdnbBuildingDirectory.factsForAddresses({
      banIds: ['69383_4180_00016'],
    });
    expect(result.isErr()).toBe(true);
  });

  // why: la cle part dans un filtre PostgREST `in.(a,b,c)`. Une valeur portant
  // une virgule ou une parenthese casserait ou elargirait la requete.
  it('refuses a malformed BAN identifier without calling out', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    const result = await bdnbBuildingDirectory.factsForAddresses({
      banIds: ['69383_4180_00016,*)'],
    });

    expect(spy).not.toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual([]);
  });

  it('caps how many addresses it looks up in one call', async () => {
    const spy = mockTwoHops([], []);
    const banIds = Array.from(
      { length: 80 },
      (_, i) => `69383_0000_${String(i).padStart(5, '0')}`,
    );

    await bdnbBuildingDirectory.factsForAddresses({ banIds });

    const url = spy.mock.calls[0]?.[0] as unknown as URL;
    const filter = url.searchParams.get('cle_interop_adr') ?? '';
    expect(filter.split(',').length).toBeLessThanOrEqual(25);
  });
});
