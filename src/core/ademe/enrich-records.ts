import type { BuildingFacts } from '@/core/building/types';
import { type ParcelArea, totalLandSurface } from './land-surface';
import type { DpeRecord } from './types';

// why: fill, never overwrite. ADEME describes the dwelling surveyed on site;
// BDNB reconstructs the building. When both speak, the survey wins. Measured
// 2026-09-22: ADEME leaves annee_construction empty on 42% of Lyon 3e
// addresses, and BDNB supplies it on the ones it links.
export function enrichRecords(input: {
  records: readonly DpeRecord[];
  facts: readonly BuildingFacts[];
  parcelAreas?: readonly ParcelArea[];
}): DpeRecord[] {
  if (input.facts.length === 0) return [...input.records];

  const byBanId = new Map(input.facts.map((fact) => [fact.banId, fact]));
  const areaByParcel = new Map(
    (input.parcelAreas ?? []).map((area) => [area.parcelId, area]),
  );

  return input.records.map((record) => {
    if (record.banId === null) return record;
    const fact = byBanId.get(record.banId);
    if (fact === undefined) return record;

    // why: a parcel the cadastre did not answer for still counts as one of the
    // building's parcels, so a partial answer never passes for a single plot.
    const parcels = fact.parcelIds.map(
      (parcelId): ParcelArea =>
        areaByParcel.get(parcelId) ?? { parcelId, areaM2: null },
    );

    return {
      ...record,
      yearBuilt: record.yearBuilt ?? fact.yearBuilt,
      buildingFloors: record.buildingFloors ?? fact.floors,
      landSurfaceM2: record.landSurfaceM2 ?? totalLandSurface(parcels),
    };
  });
}
