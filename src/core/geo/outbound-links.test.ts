import { describe, expect, it } from 'vitest';
import {
  dvfSalesUrl,
  georisquesReportUrl,
  googleMapsUrl,
  inseeCommuneUrl,
} from './outbound-links';

const LAVOISIER = { latitude: 45.755599, longitude: 4.858685 };

describe('googleMapsUrl', () => {
  // why: a coordinate query pins the point we trust; an address query lets
  // Google's geocoder pick its own building.
  it('searches the trusted coordinate, never the address', () => {
    expect(googleMapsUrl(LAVOISIER)).toBe(
      'https://www.google.com/maps/search/?api=1&query=45.755599%2C4.858685',
    );
  });
});

describe('georisquesReportUrl', () => {
  it('opens the address report placed on the trusted point', () => {
    const href = georisquesReportUrl({
      point: LAVOISIER,
      inseeCode: '69383',
      address: '16 Rue Lavoisier 69003 Lyon',
      city: 'Lyon',
    });
    expect(href).not.toBeNull();
    if (href === null) return;
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe(
      'https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2',
    );
    expect(url.searchParams.get('typeForm')).toBe('adresse');
    expect(url.searchParams.get('codeInsee')).toBe('69383');
    expect(url.searchParams.get('lat')).toBe('45.755599');
    expect(url.searchParams.get('lon')).toBe('4.858685');
    expect(url.searchParams.get('adresse')).toBe('16 Rue Lavoisier 69003 Lyon');
    expect(url.searchParams.get('city')).toBe('Lyon');
  });

  it('sends an empty city rather than the text "null"', () => {
    const href = georisquesReportUrl({
      point: LAVOISIER,
      inseeCode: '69383',
      address: '16 Rue Lavoisier 69003 Lyon',
      city: null,
    });
    expect(href).not.toBeNull();
    if (href === null) return;
    expect(new URL(href).searchParams.get('city')).toBe('');
  });

  it('gives no link for a malformed commune code', () => {
    expect(
      georisquesReportUrl({
        point: LAVOISIER,
        inseeCode: '2A04',
        address: 'x',
        city: null,
      }),
    ).toBeNull();
  });
});

describe('dvfSalesUrl', () => {
  // why: the DVF app ignores the point unless lat, lng and zoom are all set,
  // and it reads `lng`, not `lon`.
  it('centres the sales map on the trusted point at street zoom', () => {
    const href = dvfSalesUrl({ point: LAVOISIER, inseeCode: '69383' });
    expect(href).not.toBeNull();
    if (href === null) return;
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe(
      'https://explore.data.gouv.fr/fr/immobilier',
    );
    expect(url.searchParams.get('level')).toBe('commune');
    expect(url.searchParams.get('code')).toBe('69383');
    expect(url.searchParams.get('lat')).toBe('45.755599');
    expect(url.searchParams.get('lng')).toBe('4.858685');
    expect(url.searchParams.get('zoom')).toBe('18');
  });

  it('uppercases a Corsican code', () => {
    const href = dvfSalesUrl({ point: LAVOISIER, inseeCode: '2a004' });
    expect(href).not.toBeNull();
    if (href === null) return;
    expect(new URL(href).searchParams.get('code')).toBe('2A004');
  });
});

describe('inseeCommuneUrl', () => {
  it('opens the arrondissement dossier with its own code', () => {
    expect(inseeCommuneUrl('69383')).toBe(
      'https://www.insee.fr/fr/statistiques/2011101?geo=COM-69383',
    );
  });

  // why: INSEE answers HTTP 500 to COM-2a004; only the uppercase code works.
  it('uppercases and trims a Corsican code', () => {
    expect(inseeCommuneUrl(' 2a004 ')).toBe(
      'https://www.insee.fr/fr/statistiques/2011101?geo=COM-2A004',
    );
  });

  it('gives no link for a code that is not five characters', () => {
    expect(inseeCommuneUrl('2A04')).toBeNull();
    expect(inseeCommuneUrl('693830')).toBeNull();
    expect(inseeCommuneUrl('')).toBeNull();
  });
});
