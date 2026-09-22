import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({ NODE_ENV: 'test', VERCEL_ENV: 'development' }),
}));

import type { IDpeDirectory } from '@/core/ademe/ports/dpe-directory.port';
import type { DpeRecord, DpeSearchFilter } from '@/core/ademe/types';
import type { Commune, CommuneResolution } from '@/core/commune/types';
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
    yearBuilt: null,
    floor: 0,
    buildingComplement: null,
    establishedOn: '2026-01-07',
    geocodingScore: 0.62,
    ...over,
  };
}

function directoryReturning(
  records: DpeRecord[],
  total = records.length,
): { directory: IDpeDirectory; filters: DpeSearchFilter[] } {
  const filters: DpeSearchFilter[] = [];
  return {
    filters,
    directory: {
      search: async (filter) => {
        filters.push(filter);
        return ok({ records, total });
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
    const { directory } = directoryReturning([record()], 5000);

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

describe('listing fixture', () => {
  it('covers every extracted field so the DTO schema stays satisfied', () => {
    const fields = listing().fields;
    for (const name of EXTRACTED_FIELD_NAMES satisfies readonly ExtractedFieldName[]) {
      expect(fields).toHaveProperty(name);
    }
  });
});
