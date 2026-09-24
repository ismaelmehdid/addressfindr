import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const redisStore = vi.hoisted(() => new Map<string, unknown>());

vi.mock('@/infra/external-apis/redis/client', () => ({
  getRedisClient: () => ({
    get: async (key: string) => redisStore.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      redisStore.set(key, value);
      return 'OK';
    },
  }),
}));

import { dpeSearchCacheKey } from '@/core/ademe/search-cache-key';
import type { DpeRecord, DpeSearchFilter } from '@/core/ademe/types';
import { readCachedSearch, writeCachedSearch } from './search-cache';

const FILTER: DpeSearchFilter = {
  inseeCode: '69383',
  propertyType: 'apartment',
  surfaceMin: 61,
  surfaceMax: 65,
  dpeClass: 'D',
  limit: 2000,
};

const RECORD: DpeRecord = {
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
  point: { latitude: 45.7522, longitude: 4.8842 },
};

beforeEach(() => {
  redisStore.clear();
});

describe('search cache', () => {
  it('reads back what it wrote', async () => {
    const value = { records: [RECORD], total: 1, truncated: false };
    await writeCachedSearch(FILTER, value, 0);
    expect(await readCachedSearch(FILTER, 0)).toEqual(value);
  });

  // why: la production a ecrit sous ce prefixe des lignes sans `point`, que
  // le client rejette. Les relire casserait toute recherche deja en cache
  // pendant six heures apres le deploiement.
  it('never reads an entry written before records carried a point', async () => {
    const { point: _dropped, ...withoutPoint } = RECORD;
    redisStore.set(`app:ademe-search:${dpeSearchCacheKey(FILTER)}`, {
      records: [withoutPoint],
      total: 1,
      truncated: false,
    });

    expect(await readCachedSearch(FILTER, 0)).toBeNull();
  });
});
