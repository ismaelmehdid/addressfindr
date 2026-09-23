import { describe, expect, it } from 'vitest';
import {
  isOverseasPostalCode,
  isWithinMetropolitanFrance,
  parseGeoPoint,
  resolveMappablePoint,
} from '@/core/geo/resolve-mappable-point';

const LYON_3E = '45.75220201674031,4.8841949928587045';

describe('parseGeoPoint', () => {
  it('reads the ADEME "lat,lon" pair', () => {
    expect(parseGeoPoint(LYON_3E)).toEqual({
      latitude: 45.75220201674031,
      longitude: 4.8841949928587045,
    });
  });

  it('tolerates padding around each number', () => {
    expect(parseGeoPoint(' 45.75 , 4.88 ')).toEqual({
      latitude: 45.75,
      longitude: 4.88,
    });
  });

  it('refuses an empty half rather than reading it as zero', () => {
    expect(parseGeoPoint('45.75,')).toBeNull();
    expect(parseGeoPoint(',4.88')).toBeNull();
    expect(parseGeoPoint(' , ')).toBeNull();
  });

  it('refuses anything that is not exactly two numbers', () => {
    expect(parseGeoPoint(null)).toBeNull();
    expect(parseGeoPoint('')).toBeNull();
    expect(parseGeoPoint('45.75')).toBeNull();
    expect(parseGeoPoint('45.75,4.88,12')).toBeNull();
    expect(parseGeoPoint('nord,est')).toBeNull();
    expect(parseGeoPoint('Infinity,4.88')).toBeNull();
  });
});

describe('isWithinMetropolitanFrance', () => {
  it('accepts a Lyon point', () => {
    expect(
      isWithinMetropolitanFrance({ latitude: 45.752, longitude: 4.884 }),
    ).toBe(true);
  });

  it('accepts a Corsican point', () => {
    expect(
      isWithinMetropolitanFrance({ latitude: 41.926, longitude: 8.736 }),
    ).toBe(true);
  });

  it('rejects the Atlantic sentinel that ADEME reports as geocoded', () => {
    expect(
      isWithinMetropolitanFrance({
        latitude: -5.98385630920877,
        longitude: -1.363081210117898,
      }),
    ).toBe(false);
  });

  it('rejects the North Sea point ADEME derives for Reunion', () => {
    expect(
      isWithinMetropolitanFrance({
        latitude: 56.130898281525894,
        longitude: -2.6603627902420315,
      }),
    ).toBe(false);
  });

  it('rejects the real Reunion location too, since the bbox is metropole', () => {
    expect(
      isWithinMetropolitanFrance({ latitude: -20.88, longitude: 55.45 }),
    ).toBe(false);
  });
});

describe('isOverseasPostalCode', () => {
  it('flags the 97 and 98 series', () => {
    expect(isOverseasPostalCode('97400')).toBe(true);
    expect(isOverseasPostalCode('98800')).toBe(true);
  });

  it('leaves metropolitan codes alone', () => {
    expect(isOverseasPostalCode('69003')).toBe(false);
    expect(isOverseasPostalCode('20000')).toBe(false);
    expect(isOverseasPostalCode(null)).toBe(false);
  });
});

describe('resolveMappablePoint', () => {
  it('returns the point when ADEME geocoded it to the address', () => {
    expect(
      resolveMappablePoint({
        rawPoint: LYON_3E,
        geocodedToAddress: true,
        postalCode: '69003',
      }),
    ).toEqual({
      latitude: 45.75220201674031,
      longitude: 4.8841949928587045,
    });
  });

  it('drops the point when ADEME did not geocode the address', () => {
    expect(
      resolveMappablePoint({
        rawPoint: LYON_3E,
        geocodedToAddress: false,
        postalCode: '69003',
      }),
    ).toBeNull();
  });

  it('drops an overseas row even though ADEME claims it is geocoded', () => {
    expect(
      resolveMappablePoint({
        rawPoint: '56.130898281525894,-2.6603627902420315',
        geocodedToAddress: true,
        postalCode: '97400',
      }),
    ).toBeNull();
  });

  it('drops the Atlantic sentinel even though ADEME claims it is geocoded', () => {
    expect(
      resolveMappablePoint({
        rawPoint: '-5.98385630920877,-1.363081210117898',
        geocodedToAddress: true,
        postalCode: '69003',
      }),
    ).toBeNull();
  });

  it('drops an unreadable point', () => {
    expect(
      resolveMappablePoint({
        rawPoint: null,
        geocodedToAddress: true,
        postalCode: '69003',
      }),
    ).toBeNull();
  });
});
