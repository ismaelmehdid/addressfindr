import type { GeoPoint } from './types';

// why: the IGN Géoplateforme raster WMS is free and keyless; its
// ORTHOIMAGERY.ORTHOPHOTOS layer is the national aerial photography.
const WMS_ENDPOINT = 'https://data.geopf.fr/wms-r/wms';
const ORTHOPHOTO_LAYER = 'ORTHOIMAGERY.ORTHOPHOTOS';
const IMAGE_SIZE_PX = 600;
const HALF_EXTENT_M = 40;
const WEB_MERCATOR_RADIUS_M = 6_378_137;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function webMercator(point: GeoPoint): { x: number; y: number } {
  return {
    x: WEB_MERCATOR_RADIUS_M * radians(point.longitude),
    y:
      WEB_MERCATOR_RADIUS_M *
      Math.log(Math.tan(Math.PI / 4 + radians(point.latitude) / 2)),
  };
}

// why: Web Mercator (EPSG:3857) stretches every distance by 1 / cos(latitude),
// so ±40 m on the ground is ±40 / cos(latitude) projected metres. The box is
// square and so is the image, which keeps its pixels square.
export function aerialImageUrl(point: GeoPoint): string {
  const { x, y } = webMercator(point);
  const half = HALF_EXTENT_M / Math.cos(radians(point.latitude));
  const bbox = [x - half, y - half, x + half, y + half]
    .map((value) => value.toFixed(2))
    .join(',');
  const query = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: ORTHOPHOTO_LAYER,
    STYLES: '',
    CRS: 'EPSG:3857',
    BBOX: bbox,
    WIDTH: String(IMAGE_SIZE_PX),
    HEIGHT: String(IMAGE_SIZE_PX),
    FORMAT: 'image/jpeg',
  });
  return `${WMS_ENDPOINT}?${query.toString()}`;
}
