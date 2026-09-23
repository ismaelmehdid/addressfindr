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
import { ademeDpeDirectory, isGeocodedToAddress } from './ademe-dpe-directory';
import { clearLocalSearchCache } from './search-cache';

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
  type_energie_principale_chauffage: 'Gaz naturel',
  annee_construction: 1989,
  nombre_niveau_immeuble: 5,
  numero_etage_appartement: 0,
  complement_adresse_batiment: null,
  date_etablissement_dpe: '2026-01-07',
  score_ban: 0.62,
};

afterEach(() => {
  vi.unstubAllGlobals();
  clearLocalSearchCache();
});

describe('ademeDpeDirectory.search', () => {
  it('builds the lucene filter from the search', async () => {
    const spy = mockFetchOnce({ total: 0, results: [] });
    await ademeDpeDirectory.search(filter());

    const qs = calledUrl(spy).searchParams.get('qs') ?? '';
    expect(qs).toContain('code_insee_ban:"69383"');
    expect(qs).toContain('_exists_:numero_voie_ban');
    const select = calledUrl(spy).searchParams.get('select') ?? '';
    expect(select).toContain('identifiant_ban');
    expect(select).toContain('type_energie_principale_chauffage');
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
    // why: deux registres sont interroges — seul celui des existants porte la
    // ligne ici, pour que l'assertion vaille sur une ligne et une seule.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) =>
        url.pathname.includes('dpe03existant')
          ? new Response(JSON.stringify({ total: 1, results: [ROW] }), {
              status: 200,
            })
          : new Response(JSON.stringify({ total: 0, results: [] }), {
              status: 200,
            }),
      ),
    );
    const result = await ademeDpeDirectory.search(filter());

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.total).toBe(1);
    expect(result.value.records[0]).toEqual({
      dpeNumber: '2269E0123456X',
      dataset: 'existing',
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
      heatingEnergy: 'gas',
      yearBuilt: 1989,
      buildingFloors: 5,
      landSurfaceM2: null,
      floor: 0,
      buildingComplement: null,
      establishedOn: '2026-01-07',
      geocodingScore: 0.62,
      point: null,
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

  it('leaves an unrecorded heating energy null rather than guessing', async () => {
    mockFetchOnce({
      total: 1,
      results: [{ ...ROW, type_energie_principale_chauffage: 'Non affecté' }],
    });
    const result = await ademeDpeDirectory.search(filter());
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.records[0]?.heatingEnergy).toBeNull();
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

describe('ademeDpeDirectory.search — logements neufs', () => {
  function mockFetchSequence(bodies: unknown[]) {
    let call = 0;
    const spy = vi.fn(async () => {
      const body = bodies[Math.min(call, bodies.length - 1)];
      call += 1;
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  function datasetsHit(spy: ReturnType<typeof mockFetchSequence>): string[] {
    return spy.mock.calls.map((call) => {
      const url = (call as unknown as [URL])[0];
      return url.pathname.split('/datasets/')[1]?.split('/')[0] ?? '';
    });
  }

  it('queries the existing-dwelling and new-dwelling datasets', async () => {
    const spy = mockFetchSequence([{ total: 0, results: [] }]);
    await ademeDpeDirectory.search(filter());

    const hit = datasetsHit(spy);
    expect(hit).toHaveLength(2);
    expect(hit).toContain('dpe03existant');
    expect(hit).toContain('g3cgx7jb3cmys5voxz1mrm22');
  });

  it('marks which register each record came from', async () => {
    mockFetchSequence([
      { total: 1, results: [ROW] },
      { total: 1, results: [{ ...ROW, numero_dpe: 'NEUF-1' }] },
    ]);
    const result = await ademeDpeDirectory.search(filter());

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const byNumber = new Map(
      result.value.records.map((r) => [r.dpeNumber, r.dataset]),
    );
    expect(byNumber.get('2269E0123456X')).toBe('existing');
    expect(byNumber.get('NEUF-1')).toBe('new');
  });

  it('sums the totals of both registers', async () => {
    mockFetchSequence([
      { total: 40, results: [ROW] },
      { total: 2, results: [{ ...ROW, numero_dpe: 'NEUF-1' }] },
    ]);
    const result = await ademeDpeDirectory.search(filter());
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.total).toBe(42);
  });

  it('drops a DPE number returned by both registers', async () => {
    mockFetchSequence([
      { total: 1, results: [ROW] },
      { total: 1, results: [ROW] },
    ]);
    const result = await ademeDpeDirectory.search(filter());
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.records).toHaveLength(1);
  });

  // why: le registre des neufs est un complement. S'il tombe, une annonce de
  // logement ancien doit continuer a matcher plutot que de ne rien rendre.
  it('still answers from the existing register when the new one fails', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => {
        call += 1;
        const isNew = url.pathname.includes('g3cgx7jb3cmys5voxz1mrm22');
        return isNew
          ? new Response('{}', { status: 500 })
          : new Response(JSON.stringify({ total: 1, results: [ROW] }), {
              status: 200,
            });
      }),
    );

    const result = await ademeDpeDirectory.search(filter());
    expect(call).toBe(2);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.records).toHaveLength(1);
  });

  it('fails when the existing register fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => {
        const isNew = url.pathname.includes('g3cgx7jb3cmys5voxz1mrm22');
        return isNew
          ? new Response(JSON.stringify({ total: 0, results: [] }), {
              status: 200,
            })
          : new Response('{}', { status: 503 });
      }),
    );

    const result = await ademeDpeDirectory.search(filter());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });
});

describe('ademeDpeDirectory.search — cache', () => {
  it('serves a second identical search without calling the registers again', async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify({ total: 1, results: [ROW] }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', spy);

    const first = await ademeDpeDirectory.search(
      filter({ inseeCode: '69001' }),
    );
    const callsAfterFirst = spy.mock.calls.length;
    const second = await ademeDpeDirectory.search(
      filter({ inseeCode: '69001' }),
    );

    expect(callsAfterFirst).toBe(2);
    expect(spy.mock.calls.length).toBe(2);
    expect(first.isOk() && second.isOk()).toBe(true);
    if (!first.isOk() || !second.isOk()) return;
    expect(second.value.records).toEqual(first.value.records);
  });

  it('does not serve a different search from that entry', async () => {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify({ total: 1, results: [ROW] }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', spy);

    await ademeDpeDirectory.search(filter({ inseeCode: '69002' }));
    await ademeDpeDirectory.search(filter({ inseeCode: '69005' }));

    expect(spy.mock.calls.length).toBe(4);
  });

  // why: une recherche ratee ne doit pas se figer en cache, sinon une panne
  // passagere de l'ADEME condamnerait la commune pour toute la duree de vie.
  it('never caches a failed search', async () => {
    let status = 500;
    const spy = vi.fn(async () => new Response('{}', { status }));
    vi.stubGlobal('fetch', spy);

    const failed = await ademeDpeDirectory.search(
      filter({ inseeCode: '69007' }),
    );
    expect(failed.isErr()).toBe(true);

    status = 200;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ total: 1, results: [ROW] }), {
            status: 200,
          }),
      ),
    );
    const retried = await ademeDpeDirectory.search(
      filter({ inseeCode: '69007' }),
    );
    expect(retried.isOk()).toBe(true);
  });
});

describe('isGeocodedToAddress', () => {
  it('accepts the label ADEME actually sends', () => {
    expect(isGeocodedToAddress("adresse géocodée ban à l'adresse")).toBe(true);
  });

  it('accepts it back after mojibake repair', () => {
    const doubleEncoded = Array.from(
      new TextEncoder().encode("adresse géocodée ban à l'adresse"),
      (byte) => String.fromCharCode(byte),
    ).join('');
    expect(doubleEncoded).toContain('Ã');
    expect(isGeocodedToAddress(doubleEncoded)).toBe(true);
  });

  it('accepts a curly apostrophe and a narrow no-break space', () => {
    const narrowNoBreakSpace = String.fromCharCode(0x202f);
    const rightSingleQuote = String.fromCharCode(0x2019);
    expect(narrowNoBreakSpace).not.toBe(' ');
    expect(rightSingleQuote).not.toBe("'");
    const label = `adresse géocodée${narrowNoBreakSpace}ban à l${rightSingleQuote}adresse`;
    expect(isGeocodedToAddress(label)).toBe(true);
  });

  it('refuses the not-geocoded label', () => {
    expect(
      isGeocodedToAddress(
        'adresse non géocodée ban car aucune correspondance trouvée',
      ),
    ).toBe(false);
  });

  it('refuses an absent or unknown label', () => {
    expect(isGeocodedToAddress(null)).toBe(false);
    expect(isGeocodedToAddress(undefined)).toBe(false);
    expect(isGeocodedToAddress('adresse géocodée ban à la commune')).toBe(
      false,
    );
  });
});

describe('ademeDpeDirectory.search — mappable point', () => {
  it('keeps the point when ADEME geocoded the row to its address', async () => {
    mockFetchOnce({
      total: 1,
      results: [
        {
          ...ROW,
          statut_geocodage: "adresse géocodée ban à l'adresse",
          _geopoint: '45.75220201674031,4.8841949928587045',
        },
      ],
    });

    const found = await ademeDpeDirectory.search(filter());
    expect(found.isOk()).toBe(true);
    expect(found._unsafeUnwrap().records[0]?.point).toEqual({
      latitude: 45.75220201674031,
      longitude: 4.8841949928587045,
    });
  });

  it('drops the point when ADEME failed to geocode the row', async () => {
    mockFetchOnce({
      total: 1,
      results: [
        {
          ...ROW,
          statut_geocodage:
            'adresse non géocodée ban car aucune correspondance trouvée',
          _geopoint: '45.75220201674031,4.8841949928587045',
        },
      ],
    });

    const found = await ademeDpeDirectory.search(filter());
    expect(found._unsafeUnwrap().records[0]?.point).toBeNull();
  });

  it('drops the Atlantic sentinel ADEME reports as geocoded', async () => {
    mockFetchOnce({
      total: 1,
      results: [
        {
          ...ROW,
          statut_geocodage: "adresse géocodée ban à l'adresse",
          _geopoint: '-5.98385630920877,-1.363081210117898',
        },
      ],
    });

    const found = await ademeDpeDirectory.search(filter());
    expect(found._unsafeUnwrap().records[0]?.point).toBeNull();
  });

  it('drops an overseas row whose coordinate ADEME reprojected wrongly', async () => {
    mockFetchOnce({
      total: 1,
      results: [
        {
          ...ROW,
          code_postal_ban: '97400',
          statut_geocodage: "adresse géocodée ban à l'adresse",
          _geopoint: '56.130898281525894,-2.6603627902420315',
        },
      ],
    });

    const found = await ademeDpeDirectory.search(filter());
    expect(found._unsafeUnwrap().records[0]?.point).toBeNull();
  });

  it('asks ADEME for the geocoding columns', async () => {
    const spy = mockFetchOnce({ total: 0, results: [] });
    await ademeDpeDirectory.search(filter());

    const select = calledUrl(spy).searchParams.get('select') ?? '';
    expect(select).toContain('statut_geocodage');
    expect(select).toContain('_geopoint');
  });
});
