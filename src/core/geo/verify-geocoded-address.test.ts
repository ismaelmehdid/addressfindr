import { describe, expect, it } from 'vitest';
import type { GeocodedAddress } from './types';
import {
  parseRawStreetLine,
  verifyGeocodedAddress,
} from './verify-geocoded-address';

function geocoded(over: Partial<GeocodedAddress>): GeocodedAddress {
  return {
    label: '77 Route de Vertou 44200 Nantes',
    houseNumber: '77',
    street: 'Route de Vertou',
    postalCode: '44200',
    city: 'Nantes',
    inseeCode: '44109',
    banId: '44109_8392_00077',
    kind: 'housenumber',
    score: 0.79,
    point: { latitude: 47.188523, longitude: -1.531005 },
    ...over,
  };
}

// why: every case below is a raw ADEME address measured on 2026-09-24, with
// what the BAN geocoder returned for it. The geocoder score alone could not
// separate them: it was wrong at 0.51-0.59 and right at 0.37-0.50.
describe('parseRawStreetLine', () => {
  it('reads a plain numbered street', () => {
    expect(parseRawStreetLine('77 route de Vertou')).toEqual({
      houseNumber: '77',
      streetType: 'route',
      words: ['vertou'],
    });
  });

  it('finds the numbered line among building and floor lines', () => {
    expect(
      parseRawStreetLine(
        "KALLIMA 2\nBâtiment 1 - Escalier 1\n2 RUE D'ALLONVILLE\n1ER ETAGE - PORTE 1-15",
      ),
    ).toEqual({ houseNumber: '2', streetType: 'rue', words: ['allonville'] });
  });

  it('drops an apartment note after a comma', () => {
    expect(
      parseRawStreetLine('136 Rue Sainte-Catherine, Apt. N°51, dernier étage'),
    ).toEqual({
      houseNumber: '136',
      streetType: 'rue',
      words: ['sainte', 'catherine'],
    });
  });

  it('joins a number split from its street by a comma', () => {
    expect(parseRawStreetLine('51B, AVENUE LACASSAGNE')).toEqual({
      houseNumber: '51bis',
      streetType: 'avenue',
      words: ['lacassagne'],
    });
  });

  it('expands street type and title abbreviations', () => {
    expect(parseRawStreetLine('30 Rue du Dr Charles Nancel Penard')).toEqual({
      houseNumber: '30',
      streetType: 'rue',
      words: ['docteur', 'charles', 'nancel', 'penard'],
    });
    expect(parseRawStreetLine('134 bd Ernest Dalby')?.streetType).toBe(
      'boulevard',
    );
  });

  it('accepts a street with no type word', () => {
    expect(parseRawStreetLine('83 de Coulmiers')).toEqual({
      houseNumber: '83',
      streetType: null,
      words: ['coulmiers'],
    });
  });

  it('refuses a line carrying several house numbers', () => {
    expect(parseRawStreetLine("2/4/6/8 RUE GIROD DE L'AIN")).toBeNull();
    expect(parseRawStreetLine("64 68 COURS de l'YSER")).toBeNull();
  });

  it('refuses two numbered lines', () => {
    expect(
      parseRawStreetLine('62 Rue du Loup\n107 cours Alsace Lorraine'),
    ).toBeNull();
  });

  it('refuses an address with no house number', () => {
    expect(parseRawStreetLine('BAT C2 - AV GENERAL DE GAULLE')).toBeNull();
    expect(parseRawStreetLine('.')).toBeNull();
  });
});

describe('verifyGeocodedAddress', () => {
  function verify(
    raw: string,
    result: Partial<GeocodedAddress>,
    insee = '44109',
  ) {
    const line = parseRawStreetLine(raw);
    if (line === null) throw new Error(`unparseable fixture: ${raw}`);
    return verifyGeocodedAddress({
      raw: line,
      geocoded: geocoded(result),
      inseeCode: insee,
    });
  }

  it('accepts the geocoder correcting only the postal code', () => {
    expect(verify('77 route de Vertou', {})).toBe(true);
  });

  it('accepts a noisy raw line that the geocoder scored low', () => {
    expect(
      verify(
        "KALLIMA 2\nBâtiment 1 - Escalier 1\n2 RUE D'ALLONVILLE\n1ER ETAGE - PORTE 1-15",
        { houseNumber: '2', street: "Rue d'Allonville", score: 0.37 },
      ),
    ).toBe(true);
  });

  it('accepts a street the register names more fully', () => {
    expect(
      verify(
        '15 RUE RICHERAND',
        {
          houseNumber: '15',
          street: 'Rue Etienne Richerand',
          inseeCode: '69383',
        },
        '69383',
      ),
    ).toBe(true);
  });

  it('accepts a bis suffix written as a letter', () => {
    expect(
      verify(
        '51B, AVENUE LACASSAGNE',
        {
          houseNumber: '51bis',
          street: 'Avenue Lacassagne',
          inseeCode: '69383',
        },
        '69383',
      ),
    ).toBe(true);
  });

  it('refuses a different street that happens to share the number', () => {
    expect(
      verify(
        '19, rue du Champs de la Vigne',
        {
          houseNumber: '19',
          street: 'Rue de la Poterie',
          inseeCode: '35238',
          score: 0.51,
        },
        '35238',
      ),
    ).toBe(false);
    expect(
      verify(
        '5 RUE DE SAINT-LAURENT',
        {
          houseNumber: '5',
          street: 'Rue Charles Laurent',
          inseeCode: '35238',
          score: 0.55,
        },
        '35238',
      ),
    ).toBe(false);
    expect(
      verify(
        '2 RUE MONSEIGNEUR VINCENT',
        {
          houseNumber: '2',
          street: 'Rue Monseigneur Duchesne',
          inseeCode: '35238',
          score: 0.58,
        },
        '35238',
      ),
    ).toBe(false);
  });

  it('refuses a different street type', () => {
    expect(
      verify('4 route DE SAVENAY', {
        houseNumber: '4',
        street: 'Rue de Savenay',
        score: 0.73,
      }),
    ).toBe(false);
  });

  it('refuses a result in another commune', () => {
    expect(
      verify(
        "90 RUE D'INKERMANN",
        { houseNumber: '90', street: "Rue d'Inkermann", inseeCode: '69386' },
        '69383',
      ),
    ).toBe(false);
  });

  it('refuses a result that only found the street', () => {
    expect(
      verify(
        '21 Rue Desaix',
        {
          kind: 'street',
          houseNumber: null,
          street: 'Rue Desaix',
          inseeCode: '69383',
        },
        '69383',
      ),
    ).toBe(false);
  });

  it('refuses a different house number', () => {
    expect(verify('77 route de Vertou', { houseNumber: '75' })).toBe(false);
  });
});
