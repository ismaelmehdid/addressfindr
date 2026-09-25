import { describe, expect, it } from 'vitest';
import type { GeocodedAddress } from '@/core/geo/types';
import { EMPTY_EXTRACTED_VALUES } from '@/core/listing/types';
import type { DpeRecord, UnverifiedDpeRecord } from './types';
import {
  recordFromVerifiedAddress,
  unverifiedWorthVerifying,
} from './unverified-records';

function unverified(
  over: Partial<UnverifiedDpeRecord> & { dpeNumber: string },
): UnverifiedDpeRecord {
  return {
    dataset: 'existing',
    rawStreet: '77 route de Vertou',
    rawPostalCode: '44100',
    rawCity: 'NANTES',
    propertyType: 'apartment',
    surfaceM2: 64,
    dpeClass: 'E',
    gesClass: 'E',
    dpeKwhM2Year: 253.8,
    gesKgCo2M2Year: 55,
    heatingEnergy: 'gas',
    yearBuilt: 1970,
    buildingFloors: null,
    landSurfaceM2: null,
    floor: null,
    buildingComplement: null,
    establishedOn: '2025-05-16',
    visitedOn: '2025-05-15',
    annualEnergyCostEur: 1561,
    ...over,
  };
}

function verified(over: Partial<DpeRecord> & { dpeNumber: string }): DpeRecord {
  return {
    dataset: 'existing',
    banId: '44109_1000_00005',
    address: '5 Boulevard Jean XXIII 44100 Nantes',
    streetNumber: '5',
    street: 'Boulevard Jean XXIII',
    postalCode: '44100',
    city: 'Nantes',
    inseeCode: '44109',
    propertyType: 'apartment',
    surfaceM2: 69,
    dpeClass: 'E',
    gesClass: 'E',
    dpeKwhM2Year: 243.2,
    gesKgCo2M2Year: 50,
    heatingEnergy: 'gas',
    yearBuilt: null,
    buildingFloors: null,
    landSurfaceM2: null,
    floor: null,
    buildingComplement: null,
    establishedOn: '2025-05-16',
    visitedOn: '2025-05-16',
    annualEnergyCostEur: null,
    geocodingScore: 0.9,
    point: null,
    ...over,
  };
}

const LISTING = {
  ...EMPTY_EXTRACTED_VALUES,
  propertyType: 'apartment' as const,
  surfaceM2: 63,
  dpeClass: 'E' as const,
  gesClass: 'E' as const,
  heatingEnergy: 'gas' as const,
  dpeDate: '2025-05-16',
};

describe('unverifiedWorthVerifying', () => {
  // why: every verification costs a geocoder call, so only the unverified
  // rows that would reach the returned shortlist are worth one.
  it('picks an unverified row that would reach the shortlist', () => {
    const worth = unverifiedWorthVerifying({
      values: LISTING,
      records: [verified({ dpeNumber: 'v' })],
      unverified: [unverified({ dpeNumber: 'u' })],
      inseeCode: '44109',
    });
    expect(worth.map((row) => row.dpeNumber)).toEqual(['u']);
  });

  it('skips an unverified row ten better addresses keep out of the shortlist', () => {
    const better = Array.from({ length: 10 }, (_, i) =>
      verified({
        dpeNumber: `v${i}`,
        banId: `44109_1000_0000${i}`,
        address: `${i} Rue Meilleure 44100 Nantes`,
        surfaceM2: 63,
      }),
    );
    const worth = unverifiedWorthVerifying({
      values: LISTING,
      records: better,
      unverified: [
        unverified({
          dpeNumber: 'u',
          establishedOn: '2023-01-01',
          visitedOn: null,
        }),
      ],
      inseeCode: '44109',
    });
    expect(worth).toEqual([]);
  });

  it('keeps every row sharing the raw address of a shortlisted one', () => {
    const worth = unverifiedWorthVerifying({
      values: LISTING,
      records: [],
      unverified: [
        unverified({ dpeNumber: 'u1' }),
        unverified({ dpeNumber: 'u2', establishedOn: '2022-01-01' }),
      ],
      inseeCode: '44109',
    });
    expect(worth.map((row) => row.dpeNumber).sort()).toEqual(['u1', 'u2']);
  });
});

describe('recordFromVerifiedAddress', () => {
  const GEOCODED: GeocodedAddress = {
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
  };

  it('takes the address from the register and the dwelling from ADEME', () => {
    const record = recordFromVerifiedAddress(
      unverified({ dpeNumber: '2544E1624534Y' }),
      GEOCODED,
    );
    expect(record).toMatchObject({
      dpeNumber: '2544E1624534Y',
      address: '77 Route de Vertou 44200 Nantes',
      streetNumber: '77',
      street: 'Route de Vertou',
      postalCode: '44200',
      inseeCode: '44109',
      banId: '44109_8392_00077',
      surfaceM2: 64,
      establishedOn: '2025-05-16',
      point: { latitude: 47.188523, longitude: -1.531005 },
    });
  });
});
