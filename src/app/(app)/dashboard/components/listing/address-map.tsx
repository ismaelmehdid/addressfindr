'use client';

import mapboxgl, {
  type FillExtrusionLayerSpecification,
  type PaddingOptions,
} from 'mapbox-gl';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import type { GeoPoint } from '@/core/geo/types';
import 'mapbox-gl/dist/mapbox-gl.css';

// why: Mapbox v3's Standard style draws its own buildings and does not expose
// the "composite" source, so this layer is rejected there. light-v11 carries
// it, and its light background follows the visual language of DESIGN.md.
const MAP_STYLE = 'mapbox://styles/mapbox/light-v11';

const BUILDINGS_LAYER: FillExtrusionLayerSpecification = {
  id: 'add-3d-buildings',
  source: 'composite',
  'source-layer': 'building',
  filter: ['==', 'extrude', 'true'],
  type: 'fill-extrusion',
  minzoom: 15,
  paint: {
    'fill-extrusion-color': '#aaa',
    'fill-extrusion-height': [
      'interpolate',
      ['linear'],
      ['zoom'],
      15,
      0,
      15.05,
      ['get', 'height'],
    ],
    'fill-extrusion-base': [
      'interpolate',
      ['linear'],
      ['zoom'],
      15,
      0,
      15.05,
      ['get', 'min_height'],
    ],
    'fill-extrusion-opacity': 0.6,
  },
};

const PINNED_VIEW = { zoom: 17, pitch: 45, bearing: -17.6 };
const OVERVIEW_VIEW = { zoom: 12, pitch: 0, bearing: 0 };

function firstLabelLayerId(map: mapboxgl.Map): string | undefined {
  return map
    .getStyle()
    .layers.find(
      (layer) =>
        layer.type === 'symbol' && layer.layout?.['text-field'] !== undefined,
    )?.id;
}

function cameraFor(point: GeoPoint | null, overview: GeoPoint) {
  const target = point ?? overview;
  return {
    center: [target.longitude, target.latitude] as [number, number],
    ...(point === null ? OVERVIEW_VIEW : PINNED_VIEW),
  };
}

export function AddressMap({
  point,
  overview,
  focusRequest,
  padding,
  accessToken,
}: {
  point: GeoPoint | null;
  overview: GeoPoint;
  focusRequest: number;
  padding: PaddingOptions;
  accessToken: string;
}) {
  const t = useTranslations('Listing');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const initialCameraRef = useRef(cameraFor(point, overview));

  // why: every `new mapboxgl.Map()` is a billed map load. The map is built once
  // and moved afterwards, never recreated per address.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const map = new mapboxgl.Map({
      accessToken,
      container,
      style: MAP_STYLE,
      ...initialCameraRef.current,
      antialias: true,
      attributionControl: false,
    });
    mapRef.current = map;
    markerRef.current = new mapboxgl.Marker();

    // why: Mapbox's terms want the attribution, with its "Improve this map"
    // link, bottom-right. Without a `compact` option it still collapses on its
    // own when the map is 640 px wide or less.
    map.addControl(new mapboxgl.AttributionControl(), 'bottom-right');

    map.on('style.load', () => {
      map.addLayer(BUILDINGS_LAYER, firstLabelLayerId(map));
    });

    // why: Mapbox only tracks window resizes; the map also changes size when
    // the neighbouring panel grows.
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      markerRef.current?.remove();
      map.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [accessToken]);

  const latitude = point?.latitude ?? null;
  const longitude = point?.longitude ?? null;

  // why: the padding travels with every flight. `setPadding` alone would stop
  // a flight halfway when the panel moves over the map.
  // biome-ignore lint/correctness/useExhaustiveDependencies: focusRequest changes when the shown address is picked again, so the map recentres on it after the user panned away.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (map === null || marker === null) return;

    const pinned =
      latitude === null || longitude === null ? null : { latitude, longitude };
    if (pinned === null) {
      marker.remove();
    } else {
      marker.setLngLat([pinned.longitude, pinned.latitude]).addTo(map);
    }
    map.flyTo({
      ...cameraFor(pinned, {
        latitude: overview.latitude,
        longitude: overview.longitude,
      }),
      padding,
    });
  }, [
    latitude,
    longitude,
    overview.latitude,
    overview.longitude,
    focusRequest,
    padding,
  ]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={t('mapLabel')}
      className="h-full w-full"
    />
  );
}
