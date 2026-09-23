import type { BuildingFacts } from '@/core/building/types';
import type { DpeRecord } from './types';

// why: completer, jamais ecraser. L'ADEME decrit le logement diagnostique sur
// place ; la BDNB reconstitue le batiment. Quand les deux parlent, le releve
// prime. Mesure du 2026-09-22 : l'ADEME laisse annee_construction vide sur 42%
// des adresses de Lyon 3e, et la BDNB la fournit sur celles qu'elle rattache.
export function enrichRecords(input: {
  records: readonly DpeRecord[];
  facts: readonly BuildingFacts[];
}): DpeRecord[] {
  if (input.facts.length === 0) return [...input.records];

  const byBanId = new Map(input.facts.map((fact) => [fact.banId, fact]));

  return input.records.map((record) => {
    if (record.banId === null) return record;
    const fact = byBanId.get(record.banId);
    if (fact === undefined) return record;

    return {
      ...record,
      yearBuilt: record.yearBuilt ?? fact.yearBuilt,
      buildingFloors: record.buildingFloors ?? fact.floors,
    };
  });
}
