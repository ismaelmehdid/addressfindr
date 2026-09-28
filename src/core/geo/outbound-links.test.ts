import { describe, expect, it } from 'vitest';
import {
  dvfSalesUrl,
  georisquesReportUrl,
  googleMapsUrl,
  villedereveCommuneUrl,
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

describe('villedereveCommuneUrl', () => {
  it('opens the commune page by its INSEE code', () => {
    expect(villedereveCommuneUrl('33063')).toBe(
      'https://villedereve.fr/ville/33063',
    );
  });

  // why: villedereve has no arrondissement pages, so Lyon 3e, Paris 15e and
  // Marseille 1er open their commune.
  it('opens the parent commune of a municipal arrondissement', () => {
    expect(villedereveCommuneUrl('69381')).toBe(
      'https://villedereve.fr/ville/69123',
    );
    expect(villedereveCommuneUrl('69383')).toBe(
      'https://villedereve.fr/ville/69123',
    );
    expect(villedereveCommuneUrl('69389')).toBe(
      'https://villedereve.fr/ville/69123',
    );
    expect(villedereveCommuneUrl('75101')).toBe(
      'https://villedereve.fr/ville/75056',
    );
    expect(villedereveCommuneUrl('75115')).toBe(
      'https://villedereve.fr/ville/75056',
    );
    expect(villedereveCommuneUrl('75120')).toBe(
      'https://villedereve.fr/ville/75056',
    );
    expect(villedereveCommuneUrl('13201')).toBe(
      'https://villedereve.fr/ville/13055',
    );
    expect(villedereveCommuneUrl('13216')).toBe(
      'https://villedereve.fr/ville/13055',
    );
  });

  it('keeps a neighbouring code that is not an arrondissement', () => {
    expect(villedereveCommuneUrl('69380')).toBe(
      'https://villedereve.fr/ville/69380',
    );
    expect(villedereveCommuneUrl('75121')).toBe(
      'https://villedereve.fr/ville/75121',
    );
    expect(villedereveCommuneUrl('13217')).toBe(
      'https://villedereve.fr/ville/13217',
    );
  });

  it('uppercases and trims a Corsican code', () => {
    expect(villedereveCommuneUrl(' 2a004 ')).toBe(
      'https://villedereve.fr/ville/2A004',
    );
  });

  it('gives no link for a code that is not five characters', () => {
    expect(villedereveCommuneUrl('2A04')).toBeNull();
    expect(villedereveCommuneUrl('693830')).toBeNull();
    expect(villedereveCommuneUrl('')).toBeNull();
  });
});
