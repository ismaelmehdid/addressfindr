import type { GeoPoint } from '@/core/geo/types';

// why: mesure du 2026-09-23 sur 7000 lignes ADEME. Les departements d'outre-mer
// stockent leurs coordonnees dans leur projection locale (UTM 40S a La Reunion)
// mais l'ADEME les deprojette comme du Lambert-93 : 97411 sort a 56.13,-2.66,
// en mer du Nord, tout en annoncant « adresse geocodee ban a l'adresse ». La
// metropole a ses propres sentinelles, 24 lignes lyonnaises a -5.98,-1.36 au
// large du Ghana avec un score de 0,88. Une bbox metropole rattrape les deux.
const METROPOLITAN_FRANCE = {
  minLatitude: 41.3,
  maxLatitude: 51.1,
  minLongitude: -5.2,
  maxLongitude: 9.6,
} as const;

const OVERSEAS_POSTAL_PREFIXES = ['97', '98'] as const;

export function parseGeoPoint(raw: string | null): GeoPoint | null {
  if (raw === null) return null;

  const parts = raw.split(',');
  if (parts.length !== 2) return null;

  const rawLatitude = parts[0]?.trim() ?? '';
  const rawLongitude = parts[1]?.trim() ?? '';
  if (rawLatitude.length === 0 || rawLongitude.length === 0) return null;

  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
}

export function isWithinMetropolitanFrance(point: GeoPoint): boolean {
  return (
    point.latitude >= METROPOLITAN_FRANCE.minLatitude &&
    point.latitude <= METROPOLITAN_FRANCE.maxLatitude &&
    point.longitude >= METROPOLITAN_FRANCE.minLongitude &&
    point.longitude <= METROPOLITAN_FRANCE.maxLongitude
  );
}

export function isOverseasPostalCode(postalCode: string | null): boolean {
  if (postalCode === null) return false;
  const trimmed = postalCode.trim();
  return OVERSEAS_POSTAL_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export function resolveMappablePoint({
  rawPoint,
  geocodedToAddress,
  postalCode,
}: {
  rawPoint: string | null;
  geocodedToAddress: boolean;
  postalCode: string | null;
}): GeoPoint | null {
  if (!geocodedToAddress) return null;
  if (isOverseasPostalCode(postalCode)) return null;

  const point = parseGeoPoint(rawPoint);
  if (point === null) return null;

  return isWithinMetropolitanFrance(point) ? point : null;
}
