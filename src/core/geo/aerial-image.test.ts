import { describe, expect, it } from 'vitest';
import { aerialImageUrl } from './aerial-image';

const LAVOISIER = { latitude: 45.755599, longitude: 4.858685 };

function bboxOf(href: string): number[] {
  const bbox = new URL(href).searchParams.get('BBOX');
  if (bbox === null) throw new Error('no BBOX in the URL');
  return bbox.split(',').map(Number);
}

describe('aerialImageUrl', () => {
  it('asks the Géoplateforme raster WMS for a 600 px orthophoto in Web Mercator', () => {
    const url = new URL(aerialImageUrl(LAVOISIER));
    expect(url.origin + url.pathname).toBe('https://data.geopf.fr/wms-r/wms');
    expect(url.searchParams.get('SERVICE')).toBe('WMS');
    expect(url.searchParams.get('VERSION')).toBe('1.3.0');
    expect(url.searchParams.get('REQUEST')).toBe('GetMap');
    expect(url.searchParams.get('LAYERS')).toBe('ORTHOIMAGERY.ORTHOPHOTOS');
    expect(url.searchParams.get('STYLES')).toBe('');
    expect(url.searchParams.get('CRS')).toBe('EPSG:3857');
    expect(url.searchParams.get('WIDTH')).toBe('600');
    expect(url.searchParams.get('HEIGHT')).toBe('600');
    expect(url.searchParams.get('FORMAT')).toBe('image/jpeg');
  });

  // why: at the equator Web Mercator metres are ground metres, so the box
  // reads directly as ±40 m around the origin.
  it('frames ±40 m around a point on the equator', () => {
    expect(
      new URL(aerialImageUrl({ latitude: 0, longitude: 0 })).searchParams.get(
        'BBOX',
      ),
    ).toBe('-40.00,-40.00,40.00,40.00');
  });

  // why: this box was requested live on 2026-09-26 and returned the
  // orthophoto of 16 rue Lavoisier, Lyon 3e.
  it('projects the trusted point and frames it with a square box', () => {
    expect(new URL(aerialImageUrl(LAVOISIER)).searchParams.get('BBOX')).toBe(
      '540809.01,5741212.59,540923.67,5741327.25',
    );
  });

  // why: Web Mercator stretches distances by 1 / cos(latitude); at 60° N,
  // 80 m on the ground spans 160 projected metres.
  it('widens the projected box with latitude so the ground stays 80 m wide', () => {
    const [minX = 0, minY = 0, maxX = 0, maxY = 0] = bboxOf(
      aerialImageUrl({ latitude: 60, longitude: 10 }),
    );
    expect(maxX - minX).toBeCloseTo(160, 1);
    expect(maxY - minY).toBeCloseTo(160, 1);
  });
});
