import { describe, expect, it } from 'vitest';
import { EMPTY_EXTRACTED_VALUES } from '@/core/listing/types';
import { buildDpeSearch } from './build-search';
import { surfaceWindow } from './types';

const VALUES = {
  ...EMPTY_EXTRACTED_VALUES,
  propertyType: 'apartment' as const,
  surfaceM2: 63,
  dpeClass: 'D' as const,
};

describe('buildDpeSearch', () => {
  it('refuses to search without a commune', () => {
    const search = buildDpeSearch({ inseeCode: null, values: VALUES });
    expect(search).toEqual({ ok: false, reason: 'no-commune' });
  });

  it('refuses to search without a surface', () => {
    const search = buildDpeSearch({
      inseeCode: '69383',
      values: { ...VALUES, surfaceM2: null },
    });
    expect(search).toEqual({ ok: false, reason: 'no-surface' });
  });

  it('builds a filter around the stated surface', () => {
    const search = buildDpeSearch({ inseeCode: '69383', values: VALUES });
    expect(search.ok).toBe(true);
    if (!search.ok) return;
    expect(search.filter.inseeCode).toBe('69383');
    expect(search.filter.propertyType).toBe('apartment');
    expect(search.filter.dpeClass).toBe('D');
    expect(search.filter.surfaceMin).toBeCloseTo(61);
    expect(search.filter.surfaceMax).toBeCloseTo(65);
  });

  it('keeps searching when the DPE letter is absent', () => {
    const search = buildDpeSearch({
      inseeCode: '69383',
      values: { ...VALUES, dpeClass: null },
    });
    expect(search.ok).toBe(true);
    if (!search.ok) return;
    expect(search.filter.dpeClass).toBeNull();
  });
});

describe('surfaceWindow', () => {
  it('uses a floor of two square metres on small surfaces', () => {
    expect(surfaceWindow(20)).toEqual({ min: 18, max: 22 });
  });

  it('widens proportionally on large surfaces', () => {
    const window = surfaceWindow(200);
    expect(window.min).toBeCloseTo(194);
    expect(window.max).toBeCloseTo(206);
  });
});
