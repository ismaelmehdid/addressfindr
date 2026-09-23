// why: la BDNB decrit le batiment, pas le logement. Elle sert a completer ce
// que l'ADEME laisse vide, jamais a le corriger : l'ADEME est un releve de
// terrain, la BDNB une reconstitution a l'echelle du groupe de batiments.
export type BuildingFacts = {
  banId: string;
  yearBuilt: number | null;
  floors: number | null;
};

export const MAX_BUILDING_LOOKUPS = 25;
