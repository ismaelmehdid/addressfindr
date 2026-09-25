import type { GeoPoint } from '@/core/geo/types';
import type { AddressCandidate } from './types';

// why: la carte parle pour la premiere adresse du classement, ou pour celle que
// l'utilisateur a choisie. Si celle-ci n'a pas de point fiable, aucune epingle
// n'est posee : en montrer une autre afficherait une autre adresse que celle
// nommee au-dessus de la carte.
export function candidateOnMap(
  candidates: readonly AddressCandidate[],
  chosenDpeNumber: string | null,
): AddressCandidate | null {
  const chosen = candidates.find(
    (candidate) => candidate.record.dpeNumber === chosenDpeNumber,
  );
  return chosen ?? candidates[0] ?? null;
}

// why: ou poser la carte quand l'adresse affichee n'a pas de point. Tous les
// candidats sont dans la meme commune, donc le centre de leurs points fiables
// situe la commune sans designer un batiment ; null s'il n'y en a aucun.
export function mapOverview(
  candidates: readonly AddressCandidate[],
): GeoPoint | null {
  const points = candidates.flatMap((candidate) =>
    candidate.record.point === null ? [] : [candidate.record.point],
  );
  if (points.length === 0) return null;

  const sum = points.reduce(
    (total, point) => ({
      latitude: total.latitude + point.latitude,
      longitude: total.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: sum.latitude / points.length,
    longitude: sum.longitude / points.length,
  };
}
