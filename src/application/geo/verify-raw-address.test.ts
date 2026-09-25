import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({ NODE_ENV: 'test', VERCEL_ENV: 'development' }),
}));

import { externalApi } from '@/core/errors';
import type { IAddressGeocoder } from '@/core/geo/ports/address-geocoder.port';
import type { GeocodedAddress } from '@/core/geo/types';
import { verifyRawAddress } from './verify-raw-address';

const VERTOU: GeocodedAddress = {
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

function geocoderAnswering(answer: GeocodedAddress | null) {
  const queries: string[] = [];
  const geocoder: IAddressGeocoder = {
    geocode: async ({ query }) => {
      queries.push(query);
      return ok(answer);
    },
  };
  return { geocoder, queries };
}

const INPUT = {
  rawStreet: '77 route de Vertou',
  postalCode: '44100',
  city: 'NANTES',
  inseeCode: '44109',
};

describe('verifyRawAddress', () => {
  it('returns the geocoded address when it matches the raw line', async () => {
    const { geocoder, queries } = geocoderAnswering(VERTOU);
    const result = await verifyRawAddress(INPUT, { geocoder });
    expect(result._unsafeUnwrap()?.label).toBe(
      '77 Route de Vertou 44200 Nantes',
    );
    expect(queries[0]).toBe('77 route vertou 44100 NANTES');
  });

  it('returns null when the geocoder picked another street', async () => {
    const { geocoder } = geocoderAnswering({
      ...VERTOU,
      street: 'Rue de la Poterie',
      label: '77 Rue de la Poterie 44200 Nantes',
    });
    const result = await verifyRawAddress(INPUT, { geocoder });
    expect(result._unsafeUnwrap()).toBeNull();
  });

  it('never calls the geocoder for a raw line with no single house number', async () => {
    const { geocoder, queries } = geocoderAnswering(VERTOU);
    const result = await verifyRawAddress(
      { ...INPUT, rawStreet: 'BAT C2 - AV GENERAL DE GAULLE' },
      { geocoder },
    );
    expect(result._unsafeUnwrap()).toBeNull();
    expect(queries).toHaveLength(0);
  });

  it('passes a geocoder failure through', async () => {
    const geocoder: IAddressGeocoder = {
      geocode: async () => err(externalApi('ban-geocoder', 'down')),
    };
    const result = await verifyRawAddress(INPUT, { geocoder });
    expect(result.isErr()).toBe(true);
  });
});
