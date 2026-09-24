import { describe, expect, it } from 'vitest';
import type { BuildingFacts } from '@/core/building/types';
import { enrichRecords } from './enrich-records';
import type { DpeRecord } from './types';

function record(over: Partial<DpeRecord> & { dpeNumber: string }): DpeRecord {
  return {
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
    heatingEnergy: null,
    yearBuilt: null,
    buildingFloors: null,
    landSurfaceM2: null,
    floor: 0,
    buildingComplement: null,
    establishedOn: null,
    geocodingScore: 0.7,
    point: null,
    ...over,
  };
}

function facts(over: Partial<BuildingFacts> = {}): BuildingFacts {
  return {
    banId: '69383_4180_00016',
    yearBuilt: 1880,
    floors: 6,
    parcelIds: [],
    ...over,
  };
}

describe('enrichRecords', () => {
  it('fills a year the register left empty', () => {
    const [enriched] = enrichRecords({
      records: [record({ dpeNumber: 'a', yearBuilt: null })],
      facts: [facts()],
    });
    expect(enriched?.yearBuilt).toBe(1880);
  });

  // why: l'ADEME decrit le logement diagnostique, la BDNB decrit le batiment
  // modelise. Quand les deux parlent, la mesure de terrain prime : on ne
  // remplace jamais une valeur presente par une valeur reconstituee.
  it('never overwrites a year the register already stated', () => {
    const [enriched] = enrichRecords({
      records: [record({ dpeNumber: 'a', yearBuilt: 1975 })],
      facts: [facts({ yearBuilt: 1880 })],
    });
    expect(enriched?.yearBuilt).toBe(1975);
  });

  it('fills the building floor count', () => {
    const [enriched] = enrichRecords({
      records: [record({ dpeNumber: 'a' })],
      facts: [facts({ floors: 6 })],
    });
    expect(enriched?.buildingFloors).toBe(6);
  });

  it('never overwrites a floor count the register already stated', () => {
    const [enriched] = enrichRecords({
      records: [record({ dpeNumber: 'a', buildingFloors: 4 })],
      facts: [facts({ floors: 6 })],
    });
    expect(enriched?.buildingFloors).toBe(4);
  });

  it('leaves a record untouched when no fact matches its address', () => {
    const [enriched] = enrichRecords({
      records: [record({ dpeNumber: 'a', banId: '69383_9999_00001' })],
      facts: [facts()],
    });
    expect(enriched?.yearBuilt).toBeNull();
    expect(enriched?.buildingFloors).toBeNull();
  });

  it('leaves a record with no BAN identifier untouched', () => {
    const [enriched] = enrichRecords({
      records: [record({ dpeNumber: 'a', banId: null })],
      facts: [facts()],
    });
    expect(enriched?.yearBuilt).toBeNull();
  });

  it('applies one fact to every record at that address', () => {
    const enriched = enrichRecords({
      records: [
        record({ dpeNumber: 'a' }),
        record({ dpeNumber: 'b' }),
        record({ dpeNumber: 'c', banId: '69383_0000_00002', yearBuilt: null }),
      ],
      facts: [facts()],
    });
    expect(enriched.map((r) => r.yearBuilt)).toEqual([1880, 1880, null]);
  });

  it('ignores a fact whose own values are absent', () => {
    const [enriched] = enrichRecords({
      records: [record({ dpeNumber: 'a' })],
      facts: [facts({ yearBuilt: null, floors: null })],
    });
    expect(enriched?.yearBuilt).toBeNull();
    expect(enriched?.buildingFloors).toBeNull();
  });

  it('returns the records unchanged when there are no facts', () => {
    const input = [record({ dpeNumber: 'a' })];
    expect(enrichRecords({ records: input, facts: [] })).toEqual(input);
  });
});

describe('enrichRecords — surface de terrain', () => {
  it('fills the plot area when the building sits on one parcel', () => {
    const [enriched] = enrichRecords({
      records: [record({ dpeNumber: 'a', propertyType: 'house' })],
      facts: [facts({ parcelIds: ['69204000AD0022'] })],
      parcelAreas: [{ parcelId: '69204000AD0022', areaM2: 1261 }],
    });
    expect(enriched?.landSurfaceM2).toBe(1261);
  });

  it('leaves the plot area absent when the building spans several parcels', () => {
    const [enriched] = enrichRecords({
      records: [record({ dpeNumber: 'a', propertyType: 'house' })],
      facts: [facts({ parcelIds: ['69204000AD0022', '69204000AD0023'] })],
      parcelAreas: [
        { parcelId: '69204000AD0022', areaM2: 600 },
        { parcelId: '69204000AD0023', areaM2: 700 },
      ],
    });
    expect(enriched?.landSurfaceM2).toBeNull();
  });

  it('leaves the plot area absent when the cadastre did not answer', () => {
    const [enriched] = enrichRecords({
      records: [record({ dpeNumber: 'a', propertyType: 'house' })],
      facts: [facts({ parcelIds: ['69204000AD0022'] })],
      parcelAreas: [],
    });
    expect(enriched?.landSurfaceM2).toBeNull();
  });
});
