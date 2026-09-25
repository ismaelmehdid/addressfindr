import { describe, expect, it } from 'vitest';
import { candidateOnMap, mapOverview } from './candidate-on-map';
import type { AddressCandidate, DpeRecord } from './types';

const LYON_3E = { latitude: 45.7522, longitude: 4.8842 };
const LYON_7E = { latitude: 45.7322, longitude: 4.8442 };

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
    point: null,
    ...over,
  };
}

function candidate(over: Partial<DpeRecord> & { dpeNumber: string }) {
  return {
    record: record(over),
    confidence: 1,
    matched: [],
    diverged: [],
    supportingRecords: 1,
  } satisfies AddressCandidate;
}

const pinnedFirst = candidate({ dpeNumber: 'first', point: LYON_3E });
const unpinnedFirst = candidate({ dpeNumber: 'first', point: null });
const pinnedSecond = candidate({ dpeNumber: 'second', point: LYON_3E });
const unpinnedSecond = candidate({ dpeNumber: 'second', point: null });

describe('candidateOnMap', () => {
  it('shows the top-ranked candidate by default', () => {
    expect(candidateOnMap([pinnedFirst, pinnedSecond], null)).toBe(pinnedFirst);
  });

  // why: epingler la deuxieme adresse quand la premiere n'a pas de point
  // montrerait sur la carte une autre adresse que la reponse du classement.
  it('keeps the top-ranked candidate even when it has no pin', () => {
    const shown = candidateOnMap([unpinnedFirst, pinnedSecond], null);
    expect(shown).toBe(unpinnedFirst);
    expect(shown?.record.point).toBeNull();
  });

  it('moves to a candidate the user chose', () => {
    expect(candidateOnMap([unpinnedFirst, pinnedSecond], 'second')).toBe(
      pinnedSecond,
    );
  });

  // why: rester sur la premiere adresse quand l'utilisateur en choisit une
  // autre sans point laisserait l'epingle sur une adresse qu'il n'a pas choisie.
  it('moves to a chosen candidate even when it has no pin', () => {
    const shown = candidateOnMap([pinnedFirst, unpinnedSecond], 'second');
    expect(shown).toBe(unpinnedSecond);
    expect(shown?.record.point).toBeNull();
  });

  it('ignores a choice that is not in this match', () => {
    expect(candidateOnMap([pinnedFirst, pinnedSecond], 'stale')).toBe(
      pinnedFirst,
    );
  });

  it('has nothing to show without candidates', () => {
    expect(candidateOnMap([], null)).toBeNull();
  });
});

describe('mapOverview', () => {
  it('centres on the trusted points of the candidates', () => {
    const second = candidate({ dpeNumber: 'second', point: LYON_7E });
    expect(mapOverview([pinnedFirst, second])).toEqual({
      latitude: (LYON_3E.latitude + LYON_7E.latitude) / 2,
      longitude: (LYON_3E.longitude + LYON_7E.longitude) / 2,
    });
  });

  it('ignores candidates without a trusted point', () => {
    expect(mapOverview([unpinnedFirst, pinnedSecond])).toEqual(LYON_3E);
  });

  it('has nowhere to rest when no candidate has a trusted point', () => {
    expect(mapOverview([unpinnedFirst, unpinnedSecond])).toBeNull();
  });

  it('has nowhere to rest without candidates', () => {
    expect(mapOverview([])).toBeNull();
  });
});
