import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({
    NODE_ENV: 'test',
    VERCEL_ENV: 'development',
    ADEME_BASE_URL: 'https://data.ademe.fr',
    ADEME_TIMEOUT_MS: 15000,
  }),
}));

import type { DpeSearchFilter } from '@/core/ademe/types';
import { ademeDpeDirectory } from './ademe-dpe-directory';

function filter(over: Partial<DpeSearchFilter> = {}): DpeSearchFilter {
  return {
    inseeCode: '69383',
    propertyType: 'apartment',
    surfaceMin: 61,
    surfaceMax: 65,
    dpeClass: 'D',
    limit: 200,
    ...over,
  };
}

function mockFetchOnce(body: unknown, status = 200) {
  const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function calledUrl(spy: ReturnType<typeof mockFetchOnce>): URL {
  const [first] = spy.mock.calls[0] as unknown as [URL];
  return first;
}

const ROW = {
  numero_dpe: '2269E0123456X',
  identifiant_ban: '69383_4180_00016',
  adresse_ban: '16 Rue Lavoisier 69003 Lyon',
  numero_voie_ban: '16',
  nom_rue_ban: 'Rue Lavoisier',
  code_postal_ban: '69003',
  nom_commune_ban: 'Lyon',
  code_insee_ban: '69383',
  type_batiment: 'appartement',
  surface_habitable_logement: 63,
  etiquette_dpe: 'D',
  etiquette_ges: 'D',
  conso_5_usages_par_m2_ep: 200,
  emission_ges_5_usages_par_m2: 40,
  annee_construction: 1989,
  numero_etage_appartement: 0,
  complement_adresse_batiment: null,
  date_etablissement_dpe: '2026-01-07',
  score_ban: 0.62,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ademeDpeDirectory.search', () => {
  it('builds the lucene filter from the search', async () => {
    const spy = mockFetchOnce({ total: 0, results: [] });
    await ademeDpeDirectory.search(filter());

    const qs = calledUrl(spy).searchParams.get('qs') ?? '';
    expect(qs).toContain('code_insee_ban:"69383"');
    expect(qs).toContain('_exists_:numero_voie_ban');
    expect(calledUrl(spy).searchParams.get('select')).toContain(
      'identifiant_ban',
    );
    expect(qs).toContain('type_batiment:"appartement"');
    expect(qs).toContain('surface_habitable_logement:[61.00 TO 65.00]');
    expect(qs).toContain('etiquette_dpe:"D"');
  });

  it('omits the clauses the listing could not supply', async () => {
    const spy = mockFetchOnce({ total: 0, results: [] });
    await ademeDpeDirectory.search(
      filter({ propertyType: null, dpeClass: null }),
    );

    const qs = calledUrl(spy).searchParams.get('qs') ?? '';
    expect(qs).not.toContain('type_batiment');
    expect(qs).not.toContain('etiquette_dpe');
    expect(qs).toContain('code_insee_ban:"69383"');
  });

  it('maps a row onto the domain record', async () => {
    mockFetchOnce({ total: 1, results: [ROW] });
    const result = await ademeDpeDirectory.search(filter());

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.total).toBe(1);
    expect(result.value.records[0]).toEqual({
      dpeNumber: '2269E0123456X',
      banId: '69383_4180_00016',
      address: '16 Rue Lavoisier 69003 Lyon',
      streetNumber: '16',
      street: 'Rue Lavoisier',
      postalCode: '69003',
      city: 'Lyon',
      inseeCode: '69383',
      propertyType: 'apartment',
      surfaceM2: 63,
      dpeClass: 'D',
      gesClass: 'D',
      dpeKwhM2Year: 200,
      gesKgCo2M2Year: 40,
      yearBuilt: 1989,
      floor: 0,
      buildingComplement: null,
      establishedOn: '2026-01-07',
      geocodingScore: 0.62,
    });
  });

  it('drops a row with no street number, which cannot name an exact address', async () => {
    mockFetchOnce({
      total: 2,
      results: [ROW, { ...ROW, numero_dpe: 'other', numero_voie_ban: null }],
    });
    const result = await ademeDpeDirectory.search(filter());
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.records).toHaveLength(1);
  });

  it('drops a row that carries no address', async () => {
    mockFetchOnce({
      total: 2,
      results: [ROW, { ...ROW, numero_dpe: 'other', adresse_ban: null }],
    });
    const result = await ademeDpeDirectory.search(filter());
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.records).toHaveLength(1);
  });

  it('leaves an unmappable building type null rather than guessing', async () => {
    mockFetchOnce({
      total: 1,
      results: [{ ...ROW, type_batiment: 'immeuble' }],
    });
    const result = await ademeDpeDirectory.search(filter());
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.records[0]?.propertyType).toBeNull();
  });

  it('refuses a malformed INSEE code without calling out', async () => {
    const spy = mockFetchOnce({ total: 0, results: [] });
    const result = await ademeDpeDirectory.search(
      filter({ inseeCode: '69383" OR *:*' }),
    );
    expect(spy).not.toHaveBeenCalled();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });

  it('accepts a Corsican INSEE code', async () => {
    const spy = mockFetchOnce({ total: 0, results: [] });
    const result = await ademeDpeDirectory.search(
      filter({ inseeCode: '2A004' }),
    );
    expect(spy).toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
  });

  it('returns an external_api error on a server failure', async () => {
    mockFetchOnce({}, 502);
    const result = await ademeDpeDirectory.search(filter());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });
});
