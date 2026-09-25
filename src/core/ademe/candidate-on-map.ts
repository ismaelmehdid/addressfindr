import type { GeoPoint } from '@/core/geo/types';
import type { AddressCandidate } from './types';

// why: the map speaks for the top-ranked address, or for the one the user
// picked. If that one has no trusted point, no pin is placed: showing another
// would put a different address on the map than the one named above it.
export function candidateOnMap(
  candidates: readonly AddressCandidate[],
  chosenDpeNumber: string | null,
): AddressCandidate | null {
  const chosen = candidates.find(
    (candidate) => candidate.record.dpeNumber === chosenDpeNumber,
  );
  return chosen ?? candidates[0] ?? null;
}

// why: where the map rests when the address shown has no point. Every
// candidate is in the same commune, so the centre of their trusted points
// locates the commune without designating a building; null if there is none.
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
