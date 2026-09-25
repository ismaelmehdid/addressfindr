import type { GeoPoint } from './types';

const INSEE_CODE = /^(\d{5}|2[AB]\d{3})$/;

function coordinate(value: number): string {
  return value.toFixed(6);
}

// why: INSEE and DVF answer an error page to a lowercase Corsican code or a
// malformed one, so a link is only built from a well-formed code.
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

export function inseeCommuneUrl(inseeCode: string): string | null {
  const code = wellFormedInseeCode(inseeCode);
  if (code === null) return null;
  return `https://www.insee.fr/fr/statistiques/2011101?geo=COM-${code}`;
}
