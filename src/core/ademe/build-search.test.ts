import { describe, expect, it } from 'vitest';
import { EMPTY_EXTRACTED_VALUES } from '@/core/listing/types';
import {
  buildDateSearch,
  buildDpeSearch,
  departmentOfInseeCode,
} from './build-search';
import { MAX_RECORDS_FETCHED, surfaceWindow } from './types';

const VALUES = {
  ...EMPTY_EXTRACTED_VALUES,
  propertyType: 'apartment' as const,
  surfaceM2: 63,
  dpeClass: 'D' as const,
};

describe('buildDpeSearch', () => {
  it('refuses to search without a commune', () => {
    const search = buildDpeSearch({
      inseeCode: null,
      postalCodes: ['69003'],
      values: VALUES,
    });
    expect(search).toEqual({ ok: false, reason: 'no-commune' });
  });

  it('refuses to search without a surface', () => {
    const search = buildDpeSearch({
      inseeCode: '69383',
      postalCodes: ['69003'],
      values: { ...VALUES, surfaceM2: null },
    });
    expect(search).toEqual({ ok: false, reason: 'no-surface' });
  });

  it('builds a filter around the stated surface', () => {
    const search = buildDpeSearch({
      inseeCode: '69383',
      postalCodes: ['69003'],
      values: VALUES,
    });
    expect(search.ok).toBe(true);
    if (!search.ok) return;
    expect(search.filter.inseeCode).toBe('69383');
    expect(search.filter.propertyType).toBe('apartment');
    expect(search.filter.dpeClass).toBe('D');
    expect(search.filter.surfaceMin).toBeCloseTo(55.44);
    expect(search.filter.surfaceMax).toBeCloseTo(70.56);
  });

  it('keeps searching when the DPE letter is absent', () => {
    const search = buildDpeSearch({
      inseeCode: '69383',
      postalCodes: ['69003'],
      values: { ...VALUES, dpeClass: null },
    });
    expect(search.ok).toBe(true);
    if (!search.ok) return;
    expect(search.filter.dpeClass).toBeNull();
  });
});

describe('surfaceWindow', () => {
  it('uses a floor of two square metres on small surfaces', () => {
    expect(surfaceWindow(10)).toEqual({ min: 8, max: 12 });
  });

  it('widens proportionally on large surfaces', () => {
    const window = surfaceWindow(200);
    expect(window.min).toBeCloseTo(176);
    expect(window.max).toBeCloseTo(224);
  });
});

describe('surfaceWindow — bornes', () => {
  // why: /api/listings/match est une route ouverte, donc surfaceM2 arrive d'un
  // corps de requete, pas du chemin d'extraction borne. Une surface de 1 m2
  // produisait `surface_habitable_logement:[-1.00 TO 3.00]`, et l'ADEME rend
  // un HTTP 400 sur le `-` : l'utilisateur voyait une panne du registre.
  it('never produces a negative lower bound', () => {
    expect(surfaceWindow(1).min).toBeGreaterThanOrEqual(0);
    expect(surfaceWindow(0.5).min).toBeGreaterThanOrEqual(0);
  });

  it('still brackets the stated surface on a tiny one', () => {
    const window = surfaceWindow(1);
    expect(window.min).toBeLessThanOrEqual(1);
    expect(window.max).toBeGreaterThanOrEqual(1);
  });
});

describe('departmentOfInseeCode', () => {
  it('reads the two leading characters in metropolitan France', () => {
    expect(departmentOfInseeCode('35238')).toBe('35');
  });

  it('keeps the Corsican letter', () => {
    expect(departmentOfInseeCode('2A004')).toBe('2A');
  });

  it('reads three characters overseas', () => {
    expect(departmentOfInseeCode('97411')).toBe('974');
  });
});

describe('buildDateSearch', () => {
  it('does not search without a DPE date', () => {
    expect(buildDateSearch({ inseeCode: '35238', values: VALUES })).toBeNull();
  });

  it('does not search without a commune to anchor the department', () => {
    expect(
      buildDateSearch({
        inseeCode: null,
        values: { ...VALUES, dpeDate: '2026-09-17' },
      }),
    ).toBeNull();
  });

  it('searches the department on the date, type, letter and surface window', () => {
    const filter = buildDateSearch({
      inseeCode: '35238',
      values: { ...VALUES, dpeDate: '2026-09-17' },
    });
    expect(filter).toEqual({
      departmentCode: '35',
      dpeDate: '2026-09-17',
      propertyType: 'apartment',
      surfaceMin: surfaceWindow(63).min,
      surfaceMax: surfaceWindow(63).max,
      dpeClass: 'D',
      limit: MAX_RECORDS_FETCHED,
    });
  });
});
