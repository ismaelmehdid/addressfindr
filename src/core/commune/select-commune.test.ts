import { describe, expect, it } from 'vitest';
import { normalizeCommuneName, selectCommune } from './select-commune';
import type { Commune } from './types';

function commune(over: Partial<Commune> & { inseeCode: string }): Commune {
  return {
    name: 'Commune',
    postalCodes: [],
    isArrondissement: false,
    ...over,
  };
}

const LYON = commune({
  inseeCode: '69123',
  name: 'Lyon',
  postalCodes: ['69001', '69002', '69003'],
});
const LYON_3E = commune({
  inseeCode: '69383',
  name: 'Lyon 3e Arrondissement',
  postalCodes: ['69003'],
  isArrondissement: true,
});

describe('normalizeCommuneName', () => {
  it('strips diacritics, hyphens and case', () => {
    expect(normalizeCommuneName('Saint-Georges-sur-Renon')).toBe(
      'saint georges sur renon',
    );
    expect(normalizeCommuneName('Châtillon-sur-Chalaronne')).toBe(
      'chatillon sur chalaronne',
    );
  });

  it('treats a typographic apostrophe like a plain one', () => {
    expect(normalizeCommuneName('L’Abergement-Clémenciat')).toBe(
      normalizeCommuneName("L'Abergement-Clemenciat"),
    );
  });
});

describe('selectCommune', () => {
  it('prefers the arrondissement over its parent commune', () => {
    const resolution = selectCommune({
      candidates: [LYON, LYON_3E],
      city: null,
    });
    expect(resolution).toEqual({ kind: 'resolved', commune: LYON_3E });
  });

  it('resolves a postal code that maps to a single commune', () => {
    const only = commune({ inseeCode: '69204', name: 'Saint-Genis-Laval' });
    expect(selectCommune({ candidates: [only], city: null })).toEqual({
      kind: 'resolved',
      commune: only,
    });
  });

  it('uses the city name to break a tie between communes', () => {
    const a = commune({ inseeCode: '01093', name: 'Châtillon-sur-Chalaronne' });
    const b = commune({ inseeCode: '01272', name: 'Neuville-les-Dames' });
    expect(
      selectCommune({ candidates: [a, b], city: 'Chatillon sur Chalaronne' }),
    ).toEqual({ kind: 'resolved', commune: a });
  });

  it('reports ambiguity rather than guessing when the city does not match', () => {
    const a = commune({ inseeCode: '01093', name: 'Châtillon-sur-Chalaronne' });
    const b = commune({ inseeCode: '01272', name: 'Neuville-les-Dames' });
    const resolution = selectCommune({
      candidates: [a, b],
      city: 'Bourg-en-Bresse',
    });
    expect(resolution).toEqual({ kind: 'ambiguous', candidates: [a, b] });
  });

  it('reports ambiguity when no city is given and several communes share the code', () => {
    const a = commune({ inseeCode: '01093' });
    const b = commune({ inseeCode: '01272' });
    expect(selectCommune({ candidates: [a, b], city: null }).kind).toBe(
      'ambiguous',
    );
  });

  it('is unresolved on an empty candidate list', () => {
    expect(selectCommune({ candidates: [], city: 'Lyon' })).toEqual({
      kind: 'unresolved',
    });
  });

  it('never falls back to the parent commune when an arrondissement matched', () => {
    const resolution = selectCommune({
      candidates: [LYON, LYON_3E],
      city: 'Lyon',
    });
    expect(resolution).toEqual({ kind: 'resolved', commune: LYON_3E });
  });
});
