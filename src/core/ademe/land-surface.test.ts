import { describe, expect, it } from 'vitest';
import { parcelKeyOf, totalLandSurface } from './land-surface';

describe('parcelKeyOf', () => {
  it('splits a cadastral id into what the cadastre API asks for', () => {
    expect(parcelKeyOf('69204000AD0022')).toEqual({
      inseeCode: '69204',
      section: 'AD',
      number: '0022',
    });
  });

  it('handles a Corsican commune code', () => {
    expect(parcelKeyOf('2A004000BX0101')).toEqual({
      inseeCode: '2A004',
      section: 'BX',
      number: '0101',
    });
  });

  it('refuses an id of the wrong shape rather than guessing', () => {
    expect(parcelKeyOf('69204')).toBeNull();
    expect(parcelKeyOf('')).toBeNull();
    expect(parcelKeyOf('69204000AD0022EXTRA')).toBeNull();
  });
});

describe('totalLandSurface', () => {
  it('uses the area when the building sits on exactly one parcel', () => {
    expect(totalLandSurface([{ parcelId: 'a', areaM2: 1261 }])).toBe(1261);
  });

  // why: un groupe de batiments peut couvrir plusieurs parcelles, et rien ne
  // dit que le terrain de l'annonce les couvre toutes. Additionner
  // inventerait une surface. Mieux vaut ne rien rendre.
  it('returns nothing when the building spans several parcels', () => {
    expect(
      totalLandSurface([
        { parcelId: 'a', areaM2: 600 },
        { parcelId: 'b', areaM2: 700 },
      ]),
    ).toBeNull();
  });

  it('returns nothing when no parcel is known', () => {
    expect(totalLandSurface([])).toBeNull();
  });

  it('returns nothing when the single parcel has no area', () => {
    expect(totalLandSurface([{ parcelId: 'a', areaM2: null }])).toBeNull();
  });
});
