import type { DpeSearchFilter } from './types';

// why: la recherche est deterministe pour un filtre donne, et le registre ADEME
// ne bouge que par lots. Deux visiteurs collant la meme annonce doivent taper
// l'API publique une seule fois. La fenetre de surface est arrondie au
// centieme : elle vient d'un calcul flottant, et une derive invisible ne doit
// pas manquer une entree posee une seconde plus tot.
export function dpeSearchCacheKey(filter: DpeSearchFilter): string {
  return [
    filter.inseeCode,
    [...filter.postalCodes].sort().join(','),
    filter.propertyType ?? '-',
    filter.surfaceMin.toFixed(2),
    filter.surfaceMax.toFixed(2),
    filter.dpeClass ?? '-',
    filter.limit,
  ].join('|');
}
