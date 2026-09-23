import { describe, expect, it } from 'vitest';
import {
  addressGroupKey,
  normalizeAddressForComparison,
  rankOfTrueAddress,
  rankOfTrueStreet,
  streetOfAddress,
} from './address-identity';
import type { AddressCandidate, DpeRecord } from './types';

function record(over: Partial<DpeRecord> & { dpeNumber: string }): DpeRecord {
  return {
    dataset: 'existing',
    banId: null,
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
    establishedOn: null,
    geocodingScore: 0.7,
    ...over,
  };
}

function candidate(address: string): AddressCandidate {
  return {
    record: record({ dpeNumber: address, address }),
    confidence: 1,
    matched: [],
    diverged: [],
    supportingRecords: 1,
  };
}

describe('normalizeAddressForComparison', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeAddressForComparison('16 Rue Lavoisier, 69003 LYON')).toBe(
      normalizeAddressForComparison('16 rue lavoisier 69003 Lyon'),
    );
    expect(normalizeAddressForComparison('Allée des Tilleuls')).toBe(
      normalizeAddressForComparison('Allee des Tilleuls'),
    );
  });

  it('treats both apostrophe shapes alike', () => {
    const typographic = `17 Rue de l${String.fromCharCode(0x2019)}Abondance`;
    expect(normalizeAddressForComparison(typographic)).toBe(
      normalizeAddressForComparison("17 Rue de l'Abondance"),
    );
  });

  it('expands the common French street abbreviations', () => {
    expect(normalizeAddressForComparison('12 Av. de la Gare')).toBe(
      normalizeAddressForComparison('12 Avenue de la Gare'),
    );
    expect(normalizeAddressForComparison('3 Bd Victor Hugo')).toBe(
      normalizeAddressForComparison('3 Boulevard Victor Hugo'),
    );
    expect(normalizeAddressForComparison('5 Pl. Bellecour')).toBe(
      normalizeAddressForComparison('5 Place Bellecour'),
    );
    expect(normalizeAddressForComparison('7 St Jean')).toBe(
      normalizeAddressForComparison('7 Saint Jean'),
    );
  });

  it('does not collapse two genuinely different addresses', () => {
    expect(
      normalizeAddressForComparison('16 Rue Lavoisier 69003 Lyon'),
    ).not.toBe(normalizeAddressForComparison('18 Rue Lavoisier 69003 Lyon'));
  });
});

describe('addressGroupKey', () => {
  it('uses the BAN identifier when the row carries one', () => {
    const a = record({ dpeNumber: '1', banId: '69383_4180_00016' });
    const b = record({
      dpeNumber: '2',
      banId: '69383_4180_00016',
      address: '16 RUE LAVOISIER 69003 Lyon',
    });
    expect(addressGroupKey(a)).toBe(addressGroupKey(b));
  });

  it('separates two different BAN identifiers even if the text looks close', () => {
    const a = record({ dpeNumber: '1', banId: '69383_4180_00016' });
    const b = record({ dpeNumber: '2', banId: '69383_4180_00018' });
    expect(addressGroupKey(a)).not.toBe(addressGroupKey(b));
  });

  it('falls back to the normalised address when the BAN identifier is missing', () => {
    const a = record({ dpeNumber: '1', banId: null });
    const b = record({
      dpeNumber: '2',
      banId: null,
      address: '16 RUE LAVOISIER, 69003 lyon',
    });
    expect(addressGroupKey(a)).toBe(addressGroupKey(b));
  });

  it('never collides a BAN-keyed row with a text-keyed row', () => {
    const withBan = record({ dpeNumber: '1', banId: '69383_4180_00016' });
    const withoutBan = record({ dpeNumber: '2', banId: null });
    expect(addressGroupKey(withBan)).not.toBe(addressGroupKey(withoutBan));
  });
});

describe('rankOfTrueAddress', () => {
  const candidates = [
    candidate('10 Rue Mazenod 69003 Lyon'),
    candidate('16 Rue Lavoisier 69003 Lyon'),
    candidate('3 Rue Bonnefond 69003 Lyon'),
  ];

  it('reports a one-based rank for the true address', () => {
    expect(
      rankOfTrueAddress({
        candidates,
        trueAddress: '16 Rue Lavoisier 69003 Lyon',
      }),
    ).toEqual({ rank: 2, total: 3 });
  });

  it('matches through case, accents and abbreviations', () => {
    expect(
      rankOfTrueAddress({
        candidates,
        trueAddress: '10 RUE MAZENOD, 69003 Lyon',
      }),
    ).toEqual({ rank: 1, total: 3 });
  });

  it('reports a null rank when the true address is absent', () => {
    expect(
      rankOfTrueAddress({
        candidates,
        trueAddress: '1 Rue Inexistante 69003 Lyon',
      }),
    ).toEqual({ rank: null, total: 3 });
  });

  it('matches on the street even when only the postal suffix differs', () => {
    expect(
      rankOfTrueAddress({
        candidates,
        trueAddress: '16 Rue Lavoisier, 69003 Lyon 3e Arrondissement',
      }),
    ).toEqual({ rank: 2, total: 3 });
  });

  it('reports a null rank on an empty shortlist', () => {
    expect(rankOfTrueAddress({ candidates: [], trueAddress: 'x' })).toEqual({
      rank: null,
      total: 0,
    });
  });
});

describe('streetOfAddress', () => {
  it('drops the house number and the postal suffix', () => {
    expect(streetOfAddress('16 Rue Lavoisier 69003 Lyon')).toBe(
      streetOfAddress('Rue Lavoisier'),
    );
  });

  it('keeps two different streets apart', () => {
    expect(streetOfAddress('16 Rue Lavoisier 69003 Lyon')).not.toBe(
      streetOfAddress('16 Rue Mazenod 69003 Lyon'),
    );
  });

  it('handles a bis or ter suffix on the number', () => {
    expect(streetOfAddress('16 bis Rue Lavoisier 69003 Lyon')).toBe(
      streetOfAddress('Rue Lavoisier'),
    );
  });

  it('survives an address that carries no number at all', () => {
    expect(streetOfAddress('Rue Brancion')).toBe(
      streetOfAddress('Rue Brancion'),
    );
    expect(streetOfAddress('Rue Brancion').length).toBeGreaterThan(0);
  });

  it('normalises abbreviations like the address comparison does', () => {
    expect(streetOfAddress('12 Av. de la Gare 69003 Lyon')).toBe(
      streetOfAddress('Avenue de la Gare'),
    );
  });
});

describe('rankOfTrueStreet', () => {
  const candidates = [
    candidate('10 Rue Mazenod 69003 Lyon'),
    candidate('16 Rue Lavoisier 69003 Lyon'),
    candidate('22 Rue Lavoisier 69003 Lyon'),
  ];

  it('finds the first candidate standing on the true street', () => {
    expect(
      rankOfTrueStreet({ candidates, trueAddress: 'Rue Lavoisier 69003 Lyon' }),
    ).toEqual({ rank: 2, total: 3 });
  });

  it('matches a street-only truth against numbered candidates', () => {
    expect(
      rankOfTrueStreet({ candidates, trueAddress: 'Rue Mazenod' }),
    ).toEqual({ rank: 1, total: 3 });
  });

  it('reports a null rank when no candidate stands on that street', () => {
    expect(
      rankOfTrueStreet({ candidates, trueAddress: 'Rue Inexistante' }),
    ).toEqual({ rank: null, total: 3 });
  });
});
