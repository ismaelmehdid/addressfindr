import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({
    NODE_ENV: 'test',
    VERCEL_ENV: 'development',
    CADASTRE_BASE_URL: 'https://apicarto.ign.fr',
    CADASTRE_TIMEOUT_MS: 10000,
  }),
}));

import { cadastreParcelDirectory } from './cadastre-parcel-directory';

function featureCollection(features: unknown[], status = 200) {
  return new Response(JSON.stringify({ type: 'FeatureCollection', features }), {
    status,
  });
}

function parcel(idu: string, contenance: number | null) {
  return { type: 'Feature', properties: { idu, contenance } };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cadastreParcelDirectory.areasFor', () => {
  it('splits the cadastral id into the query the API expects', async () => {
    const spy = vi.fn(async (_url: URL) => featureCollection([]));
    vi.stubGlobal('fetch', spy);

    await cadastreParcelDirectory.areasFor({ parcelIds: ['69204000AD0022'] });

    const url = spy.mock.calls[0]?.[0];
    expect(url).toBeDefined();
    if (url === undefined) return;
    expect(url.searchParams.get('code_insee')).toBe('69204');
    expect(url.searchParams.get('section')).toBe('AD');
    expect(url.searchParams.get('numero')).toBe('0022');
  });

  it('reads the plot area back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => featureCollection([parcel('69204000AD0022', 1261)])),
    );

    const result = await cadastreParcelDirectory.areasFor({
      parcelIds: ['69204000AD0022'],
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([
      { parcelId: '69204000AD0022', areaM2: 1261 },
    ]);
  });

  // why: le cadastre est un complement d'un complement. S'il ne connait pas
  // une parcelle, c'est une absence, pas une panne.
  it('reports an unknown parcel as an absent area', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => featureCollection([])),
    );

    const result = await cadastreParcelDirectory.areasFor({
      parcelIds: ['69204000AD0022'],
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([
      { parcelId: '69204000AD0022', areaM2: null },
    ]);
  });

  it('refuses a malformed cadastral id without calling out', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    const result = await cadastreParcelDirectory.areasFor({
      parcelIds: ['pas-une-parcelle'],
    });

    expect(spy).not.toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual([]);
  });

  it('calls nothing on an empty list', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const result = await cadastreParcelDirectory.areasFor({ parcelIds: [] });
    expect(spy).not.toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
  });

  it('keeps going when one parcel lookup fails', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        return call === 1
          ? new Response('{}', { status: 500 })
          : featureCollection([parcel('69204000AD0023', 800)]);
      }),
    );

    const result = await cadastreParcelDirectory.areasFor({
      parcelIds: ['69204000AD0022', '69204000AD0023'],
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([{ parcelId: '69204000AD0023', areaM2: 800 }]);
  });

  it('caps how many parcels it looks up', async () => {
    const spy = vi.fn(async (_url: URL) => featureCollection([]));
    vi.stubGlobal('fetch', spy);

    const parcelIds = Array.from(
      { length: 40 },
      (_, i) => `69204000AD${String(i).padStart(4, '0')}`,
    );
    await cadastreParcelDirectory.areasFor({ parcelIds });

    expect(spy.mock.calls.length).toBeLessThanOrEqual(25);
  });
});
