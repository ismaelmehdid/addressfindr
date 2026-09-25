import { describe, expect, it } from 'vitest';
import { streetViewImagePath, streetViewPanoramaUrl } from './links';

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
