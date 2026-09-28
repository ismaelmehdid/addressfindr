import type { GeoPoint } from './types';

const INSEE_CODE = /^(\d{5}|2[AB]\d{3})$/;

function coordinate(value: number): string {
  return value.toFixed(6);
}

// why: DVF answers an error page to a lowercase Corsican code or a malformed
// one, so a link is only built from a well-formed code.
function wellFormedInseeCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return INSEE_CODE.test(code) ? code : null;
}

export function googleMapsUrl(point: GeoPoint): string {
  const query = new URLSearchParams({
    api: '1',
    query: `${coordinate(point.latitude)},${coordinate(point.longitude)}`,
  });
  return `https://www.google.com/maps/search/?${query.toString()}`;
}

export function georisquesReportUrl({
  point,
  inseeCode,
  address,
  city,
}: {
  point: GeoPoint;
  inseeCode: string;
  address: string;
  city: string | null;
}): string | null {
  const code = wellFormedInseeCode(inseeCode);
  if (code === null) return null;
  const query = new URLSearchParams({
    typeForm: 'adresse',
    city: city ?? '',
    codeInsee: code,
    lon: coordinate(point.longitude),
    lat: coordinate(point.latitude),
    adresse: address,
  });
  return `https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2?${query.toString()}`;
}

export function dvfSalesUrl({
  point,
  inseeCode,
}: {
  point: GeoPoint;
  inseeCode: string;
}): string | null {
  const code = wellFormedInseeCode(inseeCode);
  if (code === null) return null;
  const query = new URLSearchParams({
    onglet: 'carte',
    filtre: 'tous',
    level: 'commune',
    code,
    lat: coordinate(point.latitude),
    lng: coordinate(point.longitude),
    zoom: '18',
  });
  return `https://explore.data.gouv.fr/fr/immobilier?${query.toString()}`;
}

// why: villedereve has no page for a municipal arrondissement, only for the
// commune that holds it (Lyon, Paris, Marseille).
const MUNICIPAL_ARRONDISSEMENTS = [
  { first: 69381, last: 69389, commune: '69123' },
  { first: 75101, last: 75120, commune: '75056' },
  { first: 13201, last: 13216, commune: '13055' },
] as const;

function communeOf(code: string): string {
  const numeric = Number(code);
  return (
    MUNICIPAL_ARRONDISSEMENTS.find(
      ({ first, last }) => numeric >= first && numeric <= last,
    )?.commune ?? code
  );
}

export function villedereveCommuneUrl(inseeCode: string): string | null {
  const code = wellFormedInseeCode(inseeCode);
  if (code === null) return null;
  return `https://villedereve.fr/ville/${communeOf(code)}`;
}
