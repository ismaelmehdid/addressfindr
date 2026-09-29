import { describe, expect, it } from 'vitest';
import {
  streetViewEmbedUrl,
  streetViewImagePath,
  streetViewPanoramaLookupPath,
  streetViewPanoramaUrl,
} from './links';

const LYON_3E = { latitude: 45.7571234567, longitude: 4.8652 };

describe('streetViewImagePath', () => {
  it('points at the image route with rounded coordinates', () => {
    expect(streetViewImagePath(LYON_3E)).toBe(
      '/api/street-view?lat=45.757123&lon=4.865200',
    );
  });

  it('keeps the sign of a western longitude', () => {
    expect(streetViewImagePath({ latitude: 48.3904, longitude: -4.4861 })).toBe(
      '/api/street-view?lat=48.390400&lon=-4.486100',
    );
  });
});

describe('streetViewPanoramaUrl', () => {
  it('opens the interactive panorama at the point', () => {
    const url = new URL(streetViewPanoramaUrl(LYON_3E));
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.get('map_action')).toBe('pano');
    expect(url.searchParams.get('viewpoint')).toBe('45.757123,4.865200');
  });
});

describe('streetViewPanoramaLookupPath', () => {
  it('points at the panorama route with rounded coordinates', () => {
    expect(streetViewPanoramaLookupPath(LYON_3E)).toBe(
      '/api/street-view/panorama?lat=45.757123&lon=4.865200',
    );
  });
});

describe('streetViewEmbedUrl', () => {
  it("opens the photo's panorama aimed at the point with the browser key", () => {
    const url = new URL(
      streetViewEmbedUrl({
        point: LYON_3E,
        apiKey: 'embed-key',
        panorama: { panoId: 'CAoSLEFGMVFpcE1', heading: 212 },
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://www.google.com/maps/embed/v1/streetview',
    );
    expect(url.searchParams.get('key')).toBe('embed-key');
    expect(url.searchParams.get('pano')).toBe('CAoSLEFGMVFpcE1');
    expect(url.searchParams.get('heading')).toBe('212');
    expect(url.searchParams.get('location')).toBeNull();
  });

  // why: the card photo only ever comes from an outdoor panorama within 50 m;
  // without its id, the embed must search the same way, never a photosphere.
  it('falls back to the outdoor panorama nearest the point', () => {
    const url = new URL(
      streetViewEmbedUrl({
        point: LYON_3E,
        apiKey: 'embed-key',
        panorama: null,
      }),
    );
    expect(url.searchParams.get('key')).toBe('embed-key');
    expect(url.searchParams.get('location')).toBe('45.757123,4.865200');
    expect(url.searchParams.get('source')).toBe('outdoor');
    expect(url.searchParams.get('radius')).toBe('50');
    expect(url.searchParams.get('pano')).toBeNull();
  });

  it('keeps a key with reserved characters inside its own parameter', () => {
    const url = new URL(
      streetViewEmbedUrl({
        point: LYON_3E,
        apiKey: 'a&location=0,0',
        panorama: null,
      }),
    );
    expect(url.searchParams.get('key')).toBe('a&location=0,0');
    expect(url.searchParams.getAll('location')).toEqual(['45.757123,4.865200']);
  });
});
