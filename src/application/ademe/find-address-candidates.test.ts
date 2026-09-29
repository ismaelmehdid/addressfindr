import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({ NODE_ENV: 'test', VERCEL_ENV: 'development' }),
}));

import type { getBuildingFacts } from '@/application/building/get-building-facts';
import type { ResolveCommuneInput } from '@/application/commune/dto';
import type { IDpeDirectory } from '@/core/ademe/ports/dpe-directory.port';
import type {
  DpeDateSearchFilter,
  DpeRecord,
  DpeSearchFilter,
  UnverifiedDpeRecord,
} from '@/core/ademe/types';
import type { BuildingFacts } from '@/core/building/types';
import type { Commune, CommuneResolution } from '@/core/commune/types';
import { externalApi } from '@/core/errors';
import {
  EMPTY_EXTRACTED_VALUES,
  EXTRACTED_FIELD_NAMES,
  type ExtractedFieldName,
  type ExtractedListing,
} from '@/core/listing/types';
import { findAddressCandidates } from './find-address-candidates';

const LYON_3E: Commune = {
  inseeCode: '69383',
  name: 'Lyon 3e Arrondissement',
  postalCodes: ['69003'],
  isArrondissement: true,
};

function listing(
  over: Partial<ExtractedListing['fields']> = {},
): ExtractedListing {
  const sources = Object.fromEntries(
    EXTRACTED_FIELD_NAMES.map((name) => [name, 'hydration' as const]),
  ) as ExtractedListing['sources'];

  return {
    fields: {
      ...EMPTY_EXTRACTED_VALUES,
      portal: 'leboncoin',
      canonicalUrl: 'https://www.leboncoin.fr/ad/ventes_immobilieres/1',
      pin: null,
      propertyType: 'apartment',
      surfaceM2: 63,
      dpeClass: 'D',
      gesClass: 'D',
      dpeKwhM2Year: 200,
      gesKgCo2M2Year: 40,
      postalCode: '69003',
      city: 'Lyon',
      ...over,
    },
    sources,
  };
}

function record(over: Partial<DpeRecord> = {}): DpeRecord {
  return {
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
    heatingEnergy: null,
    yearBuilt: null,
    landSurfaceM2: null,
    buildingFloors: null,
    floor: 0,
    buildingComplement: null,
    establishedOn: '2026-01-07',
    visitedOn: null,
    annualEnergyCostEur: null,
    geocodingScore: 0.62,
    point: null,
    ...over,
  };
}

function directoryReturning(
  records: DpeRecord[],
  total = records.length,
  truncated = false,
  byDate: DpeRecord[] = [],
  unverified: UnverifiedDpeRecord[] = [],
): {
  directory: IDpeDirectory;
  filters: DpeSearchFilter[];
  dateFilters: DpeDateSearchFilter[];
} {
  const filters: DpeSearchFilter[] = [];
  const dateFilters: DpeDateSearchFilter[] = [];
  return {
    filters,
    dateFilters,
    directory: {
      search: async (filter) => {
        filters.push(filter);
        return ok({ records, unverified, total, truncated });
      },
      searchByDate: async (filter) => {
        dateFilters.push(filter);
        return ok({ records: byDate, total: byDate.length, truncated: false });
      },
    },
  };
}

function communeResolving(resolution: CommuneResolution) {
  return async () => ok(resolution);
}

describe('findAddressCandidates', () => {
  it('searches the resolved commune and ranks what comes back', async () => {
    const { directory, filters } = directoryReturning([record()]);

    const result = await findAddressCandidates(
      { listing: listing() },
      {
        dpeDirectory: directory,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(filters[0]?.inseeCode).toBe('69383');
    expect(result.value.candidates).toHaveLength(1);
    expect(result.value.candidates[0]?.record.address).toBe(
      '16 Rue Lavoisier 69003 Lyon',
    );
    expect(result.value.candidates[0]?.confidence).toBe(1);
  });

  it('refuses rather than searching when the commune stays ambiguous', async () => {
    const { directory, filters } = directoryReturning([record()]);

    const result = await findAddressCandidates(
      { listing: listing() },
      {
        dpeDirectory: directory,
        resolveCommune: communeResolving({ kind: 'ambiguous', candidates: [] }),
      },
    );

    expect(filters).toHaveLength(0);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });

  it('refuses rather than searching when the listing states no surface', async () => {
    const { directory, filters } = directoryReturning([record()]);

    const result = await findAddressCandidates(
      { listing: listing({ surfaceM2: null }) },
      {
        dpeDirectory: directory,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );

    expect(filters).toHaveLength(0);
    expect(result.isErr()).toBe(true);
  });

  it('reports truncation when the register holds more than it returned', async () => {
    const { directory } = directoryReturning([record()], 5000, true);

    const result = await findAddressCandidates(
      { listing: listing() },
      {
        dpeDirectory: directory,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.truncated).toBe(true);
  });

  it('returns an empty shortlist rather than an error when nothing matches', async () => {
    const { directory } = directoryReturning([]);

    const result = await findAddressCandidates(
      { listing: listing() },
      {
        dpeDirectory: directory,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.candidates).toEqual([]);
  });

  it('keeps the DPE letter out of the filter when the listing never stated one', async () => {
    const { directory, filters } = directoryReturning([record()]);

    await findAddressCandidates(
      { listing: listing({ dpeClass: null }) },
      {
        dpeDirectory: directory,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );

    expect(filters[0]?.dpeClass).toBeNull();
  });

  it('rejects a payload that is not an extracted listing', async () => {
    const { directory } = directoryReturning([record()]);
    const notAListing = { listing: { fields: {}, sources: {} } };

    const result = await findAddressCandidates(
      notAListing as unknown as Parameters<typeof findAddressCandidates>[0],
      { dpeDirectory: directory },
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });
});

describe('findAddressCandidates — INSEE code provenance', () => {
  it.each([
    { source: 'hydration', origin: 'structured' },
    { source: 'json-ld', origin: 'structured' },
    { source: 'llm', origin: 'quoted' },
  ] as const)('passes an INSEE code read from $source as $origin', async ({
    source,
    origin,
  }) => {
    const { directory } = directoryReturning([record()]);
    const seen: ResolveCommuneInput[] = [];
    const base = listing({ inseeCode: '69383' });

    await findAddressCandidates(
      { listing: { ...base, sources: { ...base.sources, inseeCode: source } } },
      {
        dpeDirectory: directory,
        resolveCommune: async (input) => {
          seen.push(input);
          return ok({ kind: 'resolved', commune: LYON_3E });
        },
      },
    );

    expect(seen[0]?.inseeCodeOrigin).toBe(origin);
  });
});

describe('listing fixture', () => {
  it('covers every extracted field so the DTO schema stays satisfied', () => {
    const fields = listing().fields;
    for (const name of EXTRACTED_FIELD_NAMES satisfies readonly ExtractedFieldName[]) {
      expect(fields).toHaveProperty(name);
    }
  });
});

describe('findAddressCandidates — enrichissement batiment', () => {
  function buildingFactsReturning(facts: BuildingFacts[]): {
    lookup: typeof getBuildingFacts;
    asked: string[][];
  } {
    const asked: string[][] = [];
    return {
      asked,
      lookup: async ({ banIds }) => {
        asked.push([...banIds]);
        return ok(facts);
      },
    };
  }

  const bare = listing({
    dpeClass: null,
    gesClass: null,
    dpeKwhM2Year: null,
    gesKgCo2M2Year: null,
  });

  // why: sans annee cote ADEME — 42% des adresses de Lyon 3e — la BDNB est le
  // seul moyen de comparer l'annee que l'annonce affiche.
  it('fills a missing year from the building register and scores on it', async () => {
    const { directory } = directoryReturning([
      record({ dpeNumber: 'a', banId: '69383_4180_00016', yearBuilt: null }),
    ]);
    const building = buildingFactsReturning([
      { banId: '69383_4180_00016', yearBuilt: 1880, floors: 6, parcelIds: [] },
    ]);

    const result = await findAddressCandidates(
      { listing: listing({ yearBuilt: 1880 }) },
      {
        dpeDirectory: directory,
        getBuildingFacts: building.lookup,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.candidates[0]?.record.yearBuilt).toBe(1880);
    expect(result.value.candidates[0]?.matched).toContain('yearBuilt');
  });

  it('asks the building register only about the addresses it might return', async () => {
    const { directory } = directoryReturning(
      Array.from({ length: 60 }, (_, i) =>
        record({
          dpeNumber: `d-${i}`,
          banId: `69383_0000_${String(i).padStart(5, '0')}`,
          address: `${i} Rue Longue 69003 Lyon`,
        }),
      ),
    );
    const building = buildingFactsReturning([]);

    await findAddressCandidates(
      { listing: listing() },
      {
        dpeDirectory: directory,
        getBuildingFacts: building.lookup,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );

    expect(building.asked).toHaveLength(1);
    expect(building.asked[0]?.length).toBeLessThanOrEqual(25);
    expect(building.asked[0]?.length).toBeGreaterThan(0);
  });

  // why: l'enrichissement est un bonus. Une panne BDNB ne doit pas faire
  // echouer une recherche qui aboutissait sans elle.
  it('still answers when the building register fails', async () => {
    const { directory } = directoryReturning([record({ dpeNumber: 'a' })]);
    const failing: typeof getBuildingFacts = async () =>
      err(externalApi('bdnb', 'down'));

    const result = await findAddressCandidates(
      { listing: listing() },
      {
        dpeDirectory: directory,
        getBuildingFacts: failing,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.candidates).toHaveLength(1);
  });

  // why: la porte anti-preuve-mince se decide APRES enrichissement, sinon une
  // annonce sans DPE mais avec une annee serait refusee alors que la BDNB
  // vient justement de rendre l'annee comparable.
  it('lets the building register unlock an answer the bare registers refused', async () => {
    const records = [
      record({
        dpeNumber: 'a',
        banId: '69383_4180_00016',
        yearBuilt: null,
        dpeClass: null,
        gesClass: null,
        dpeKwhM2Year: null,
        gesKgCo2M2Year: null,
      }),
    ];

    const withoutBuilding = await findAddressCandidates(
      { listing: { ...bare, fields: { ...bare.fields, yearBuilt: 1880 } } },
      {
        dpeDirectory: directoryReturning(records).directory,
        getBuildingFacts: buildingFactsReturning([]).lookup,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );
    expect(withoutBuilding.isOk()).toBe(true);
    if (!withoutBuilding.isOk()) return;
    expect(withoutBuilding.value.refusedFor).toBe('insufficient-evidence');

    const withBuilding = await findAddressCandidates(
      { listing: { ...bare, fields: { ...bare.fields, yearBuilt: 1880 } } },
      {
        dpeDirectory: directoryReturning(records).directory,
        getBuildingFacts: buildingFactsReturning([
          {
            banId: '69383_4180_00016',
            yearBuilt: 1880,
            floors: 6,
            parcelIds: [],
          },
        ]).lookup,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );
    expect(withBuilding.isOk()).toBe(true);
    if (!withBuilding.isOk()) return;
    expect(withBuilding.value.refusedFor).toBeNull();
    expect(withBuilding.value.candidates).toHaveLength(1);
  });
});

describe('findAddressCandidates — outside the stated commune', () => {
  // why: measured 2026-09-24, a leboncoin listing labelled "Rennes" describes
  // a house in Melesse, and precisement.fr found it there. The exact DPE date
  // is what makes a search beyond the commune safe.
  const DATED = { dpeDate: '2026-09-17' };
  const MELESSE = record({
    dpeNumber: '2635E2385254C',
    banId: '35173_0120_00037',
    address: '37 Rue Alain Colas 35520 Melesse',
    inseeCode: '35173',
    establishedOn: '2026-09-17',
  });

  it('looks beyond the commune when no row there carries the DPE date', async () => {
    const { directory, dateFilters } = directoryReturning(
      [record()],
      1,
      false,
      [MELESSE],
    );
    const result = await findAddressCandidates(
      { listing: listing(DATED) },
      {
        dpeDirectory: directory,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );

    expect(dateFilters[0]?.departmentCode).toBe('69');
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.candidates[0]?.record.address).toBe(
      '37 Rue Alain Colas 35520 Melesse',
    );
  });

  // why: measured 2026-09-24, a Nantes apartment pool held 5570 rows for a
  // 5000-row fetch limit, and the row carrying the listing's date was cut.
  it('recovers a row of the commune that the commune search cut off', async () => {
    const cutOff = record({
      dpeNumber: '2644E1548320R',
      banId: '69383_0001_00001',
      address: '1 Avenue des Diligences 69003 Lyon',
      establishedOn: '2026-09-17',
    });
    const { directory } = directoryReturning([record()], 5570, true, [cutOff]);
    const result = await findAddressCandidates(
      { listing: listing(DATED) },
      {
        dpeDirectory: directory,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.candidates[0]?.record.dpeNumber).toBe('2644E1548320R');
  });

  it('never searches beyond the commune on a DPE date older than the registers', async () => {
    const { directory, dateFilters } = directoryReturning([record()]);
    await findAddressCandidates(
      { listing: listing({ dpeDate: '2018-09-05' }) },
      {
        dpeDirectory: directory,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );
    expect(dateFilters).toHaveLength(0);
  });

  it('stays in the commune when a row there carries the DPE date', async () => {
    const { directory, dateFilters } = directoryReturning(
      [record({ establishedOn: '2026-09-17' })],
      1,
      false,
      [MELESSE],
    );
    await findAddressCandidates(
      { listing: listing(DATED) },
      {
        dpeDirectory: directory,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );
    expect(dateFilters).toHaveLength(0);
  });

  it('never admits an outside row that contradicts the listing', async () => {
    const { directory } = directoryReturning([record()], 1, false, [
      { ...MELESSE, dpeKwhM2Year: 320 },
    ]);
    const result = await findAddressCandidates(
      { listing: listing(DATED) },
      {
        dpeDirectory: directory,
        resolveCommune: communeResolving({
          kind: 'resolved',
          commune: LYON_3E,
        }),
      },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(
      result.value.candidates.map((candidate) => candidate.record.inseeCode),
    ).not.toContain('35173');
  });
});

describe('findAddressCandidates — rows ADEME never geocoded', () => {
  // why: measured 2026-09-24, 1.1 to 10.8 % of a city's rows carry only the
  // address the diagnostician typed. precisement.fr answered one of them. It
  // is returned only once the national address register recognises it.
  const TYPED: UnverifiedDpeRecord = {
    dpeNumber: '2569E0000001A',
    dataset: 'existing',
    rawStreet: '16 rue Lavoisier',
    rawPostalCode: '69003',
    rawCity: 'LYON',
    propertyType: 'apartment',
    surfaceM2: 63,
    dpeClass: 'D',
    gesClass: 'D',
    dpeKwhM2Year: 200,
    gesKgCo2M2Year: 40,
    heatingEnergy: null,
    yearBuilt: null,
    buildingFloors: null,
    landSurfaceM2: null,
    floor: null,
    buildingComplement: null,
    establishedOn: '2026-01-07',
    visitedOn: null,
    annualEnergyCostEur: null,
  };
  const RECOGNISED = {
    label: '16 Rue Lavoisier 69003 Lyon',
    houseNumber: '16',
    street: 'Rue Lavoisier',
    postalCode: '69003',
    city: 'Lyon',
    inseeCode: '69383',
    banId: '69383_4180_00016',
    kind: 'housenumber',
    score: 0.9,
    point: { latitude: 45.76, longitude: 4.85 },
  };
  const LYON = communeResolving({ kind: 'resolved', commune: LYON_3E });

  it('searches the commune postal codes for them', async () => {
    const { directory, filters } = directoryReturning([]);
    await findAddressCandidates(
      { listing: listing() },
      {
        dpeDirectory: directory,
        resolveCommune: LYON,
        verifyRawAddress: async () => ok(null),
      },
    );
    expect(filters[0]?.postalCodes).toEqual(['69003']);
  });

  it('returns one once the register recognises its typed address', async () => {
    const { directory } = directoryReturning([], 0, false, [], [TYPED]);
    const asked: string[] = [];
    const result = await findAddressCandidates(
      { listing: listing() },
      {
        dpeDirectory: directory,
        resolveCommune: LYON,
        verifyRawAddress: async (input) => {
          asked.push(input.rawStreet);
          return ok(RECOGNISED);
        },
      },
    );
    expect(asked).toEqual(['16 rue Lavoisier']);
    const candidate = result._unsafeUnwrap().candidates[0];
    expect(candidate?.record.dpeNumber).toBe('2569E0000001A');
    expect(candidate?.record.address).toBe('16 Rue Lavoisier 69003 Lyon');
    expect(candidate?.record.banId).toBe('69383_4180_00016');
  });

  it('never returns one the register does not recognise', async () => {
    const { directory } = directoryReturning([], 0, false, [], [TYPED]);
    const result = await findAddressCandidates(
      { listing: listing() },
      {
        dpeDirectory: directory,
        resolveCommune: LYON,
        verifyRawAddress: async () => ok(null),
      },
    );
    expect(result._unsafeUnwrap().candidates).toEqual([]);
  });

  it('still answers the geocoded rows when the geocoder fails', async () => {
    const { directory } = directoryReturning([record()], 1, false, [], [TYPED]);
    const result = await findAddressCandidates(
      { listing: listing() },
      {
        dpeDirectory: directory,
        resolveCommune: LYON,
        verifyRawAddress: async () => err(externalApi('ban-geocoder', 'down')),
      },
    );
    expect(
      result._unsafeUnwrap().candidates.map((c) => c.record.dpeNumber),
    ).toEqual(['2269E0123456X']);
  });
});
