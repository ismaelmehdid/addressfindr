import { describe, expect, it } from 'vitest';
import {
  cameraAngle,
  mapStyleUrl,
  pickedMapView,
  showsBuildings,
} from './map-view';

describe('mapStyleUrl', () => {
  it.each([
    ['map', 'mapbox://styles/mapbox/light-v11'],
    ['satellite', 'mapbox://styles/mapbox/satellite-streets-v12'],
  ] as const)('draws the %s view with %s', (view, url) => {
    expect(mapStyleUrl(view)).toBe(url);
  });
});

describe('showsBuildings', () => {
  it('extrudes the buildings on the map view', () => {
    expect(showsBuildings('map')).toBe(true);
  });

  it('leaves the real roofs visible on the satellite view', () => {
    expect(showsBuildings('satellite')).toBe(false);
  });
});

describe('cameraAngle', () => {
  it('tilts the map view over a pinned address', () => {
    expect(cameraAngle('map', 'address')).toEqual({
      pitch: 45,
      bearing: -17.6,
    });
  });

  it('looks straight down, north up, at a pinned address in the satellite view', () => {
    expect(cameraAngle('satellite', 'address')).toEqual({
      pitch: 0,
      bearing: 0,
    });
  });

  it.each([
    'map',
    'satellite',
  ] as const)('keeps the %s overview flat, north up', (view) => {
    expect(cameraAngle(view, 'overview')).toEqual({ pitch: 0, bearing: 0 });
  });
});

describe('pickedMapView', () => {
  it.each([
    'map',
    'satellite',
  ] as const)('reads %s as the picked view', (view) => {
    expect(pickedMapView([view])).toBe(view);
  });

  it('picks nothing when the pressed option is pressed again', () => {
    expect(pickedMapView([])).toBeNull();
  });

  it.each([
    ['terrain'],
    ['Map'],
    [''],
  ])('ignores the unknown value %j', (value) => {
    expect(pickedMapView([value])).toBeNull();
  });
});
