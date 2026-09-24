'use client';

import mapboxgl, { type FillExtrusionLayerSpecification } from 'mapbox-gl';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import type { GeoPoint } from '@/core/geo/types';
import 'mapbox-gl/dist/mapbox-gl.css';

// why: le style Standard de Mapbox v3 dessine deja ses batiments et n'expose
// pas la source « composite », donc cette couche y est rejetee. light-v11 la
// porte, et son fond clair suit la langue visuelle de DESIGN.md.
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

const ZOOM = 17;
const PITCH = 45;
const BEARING = -17.6;

function firstLabelLayerId(map: mapboxgl.Map): string | undefined {
  return map
    .getStyle()
    .layers.find(
      (layer) =>
        layer.type === 'symbol' && layer.layout?.['text-field'] !== undefined,
    )?.id;
}

export function AddressMap({
  point,
  accessToken,
}: {
  point: GeoPoint;
  accessToken: string;
}) {
  const t = useTranslations('Listing');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const initialPointRef = useRef(point);

  // why: chaque `new mapboxgl.Map()` est un chargement facture. La carte est
  // donc construite une fois et deplacee ensuite, jamais recreee par adresse.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const initial = initialPointRef.current;
    const map = new mapboxgl.Map({
      accessToken,
      container,
      style: MAP_STYLE,
      center: [initial.longitude, initial.latitude],
      zoom: ZOOM,
      pitch: PITCH,
      bearing: BEARING,
      antialias: true,
    });
    mapRef.current = map;

    const marker = new mapboxgl.Marker()
      .setLngLat([initial.longitude, initial.latitude])
      .addTo(map);
    markerRef.current = marker;

    map.on('style.load', () => {
      map.addLayer(BUILDINGS_LAYER, firstLabelLayerId(map));
    });

    return () => {
      marker.remove();
      map.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [accessToken]);

  useEffect(() => {
    markerRef.current?.setLngLat([point.longitude, point.latitude]);
    mapRef.current?.flyTo({
      center: [point.longitude, point.latitude],
      zoom: ZOOM,
    });
  }, [point.latitude, point.longitude]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={t('mapLabel')}
      className="mt-2 h-[320px] w-full overflow-hidden rounded-lg border border-border"
    />
  );
}
