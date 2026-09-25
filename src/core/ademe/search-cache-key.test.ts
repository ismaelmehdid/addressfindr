import { describe, expect, it } from 'vitest';
import { dpeSearchCacheKey } from './search-cache-key';
import type { DpeSearchFilter } from './types';

function filter(over: Partial<DpeSearchFilter> = {}): DpeSearchFilter {
  return {
    inseeCode: '69383',
    postalCodes: ['69003'],
    propertyType: 'apartment',
    surfaceMin: 61,
    surfaceMax: 65,
    dpeClass: 'D',
    limit: 2000,
    ...over,
  };
}

describe('dpeSearchCacheKey', () => {
  it('is stable for the same filter', () => {
    expect(dpeSearchCacheKey(filter())).toBe(dpeSearchCacheKey(filter()));
  });

  it('changes with the commune', () => {
    expect(dpeSearchCacheKey(filter())).not.toBe(
      dpeSearchCacheKey(filter({ inseeCode: '69204' })),
    );
  });

  it('changes with the postal codes the raw rows are searched on', () => {
    expect(dpeSearchCacheKey(filter())).not.toBe(
      dpeSearchCacheKey(filter({ postalCodes: ['69003', '69008'] })),
    );
  });

  it('changes with the DPE letter', () => {
    expect(dpeSearchCacheKey(filter())).not.toBe(
      dpeSearchCacheKey(filter({ dpeClass: 'E' })),
    );
  });

  it('distinguishes an absent DPE letter from a present one', () => {
    expect(dpeSearchCacheKey(filter({ dpeClass: null }))).not.toBe(
      dpeSearchCacheKey(filter({ dpeClass: 'D' })),
    );
  });

  it('changes with the surface window', () => {
    expect(dpeSearchCacheKey(filter())).not.toBe(
      dpeSearchCacheKey(filter({ surfaceMax: 66 })),
    );
  });

  // why: le plafond fait partie de la reponse — une entree posee a 2000 lignes
  // ne peut pas servir a une recherche qui en demande davantage.
  it('changes with the fetch limit', () => {
    expect(dpeSearchCacheKey(filter())).not.toBe(
      dpeSearchCacheKey(filter({ limit: 500 })),
    );
  });

  it('rounds the surface window so a hair of drift still hits', () => {
    expect(dpeSearchCacheKey(filter({ surfaceMin: 61.000_1 }))).toBe(
      dpeSearchCacheKey(filter({ surfaceMin: 61 })),
    );
  });

  it('stays within a sane key length', () => {
    expect(dpeSearchCacheKey(filter()).length).toBeLessThan(120);
  });
});
