'use client';

import mapboxgl, {
  type FillExtrusionLayerSpecification,
  type PaddingOptions,
} from 'mapbox-gl';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import type { GeoPoint } from '@/core/geo/types';
import {
  cameraAngle,
  type MapView,
  mapStyleUrl,
  showsBuildings,
} from './map-view';
import 'mapbox-gl/dist/mapbox-gl.css';

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

const PINNED_ZOOM = 17;
const OVERVIEW_ZOOM = 12;
const VIEW_SWITCH_EASE_MS = 500;

function firstLabelLayerId(map: mapboxgl.Map): string | undefined {
  return map
    .getStyle()
    .layers.find(
      (layer) =>
        layer.type === 'symbol' && layer.layout?.['text-field'] !== undefined,
    )?.id;
}

function cameraFor({
  point,
  overview,
  view,
}: {
  point: GeoPoint | null;
  overview: GeoPoint;
  view: MapView;
}) {
  const target = point ?? overview;
  return {
    center: [target.longitude, target.latitude] as [number, number],
    zoom: point === null ? OVERVIEW_ZOOM : PINNED_ZOOM,
    ...cameraAngle(view, point === null ? 'overview' : 'address'),
  };
}

export function AddressMap({
  point,
  overview,
  focusRequest,
  padding,
  view,
  accessToken,
}: {
  point: GeoPoint | null;
  overview: GeoPoint;
  focusRequest: number;
  padding: PaddingOptions;
  view: MapView;
  accessToken: string;
}) {
  const t = useTranslations('Listing');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const initialCameraRef = useRef(cameraFor({ point, overview, view }));
  const styledViewRef = useRef(view);
  const cameraTarget = point === null ? 'overview' : 'address';

  // why: every `new mapboxgl.Map()` is a billed map load. The map is built once
  // and moved afterwards, never recreated per address.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const map = new mapboxgl.Map({
      accessToken,
      container,
      style: mapStyleUrl(styledViewRef.current),
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
      if (showsBuildings(styledViewRef.current)) {
        map.addLayer(BUILDINGS_LAYER, firstLabelLayerId(map));
      }
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

  // why: `setStyle` restyles the map already loaded, so unlike a new map it
  // is not billed. Without a diff, Mapbox rebuilds the style and fires
  // `style.load` again, where the buildings follow the new view; the marker
  // and the attribution stay as they are. The camera only turns to the new
  // view's angle: an ease without a center or zoom keeps the spot the user
  // is looking at.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || styledViewRef.current === view) return;
    styledViewRef.current = view;
    map.setStyle(mapStyleUrl(view), {
      diff: false,
      // why: the options type requires both font families; these are the
      // Mapbox defaults the map was built with, so the labels keep their fonts.
      localFontFamily: null,
      localIdeographFontFamily: 'sans-serif',
    });
    map.easeTo({
      ...cameraAngle(view, cameraTarget),
      padding,
      duration: VIEW_SWITCH_EASE_MS,
    });
  }, [view, cameraTarget, padding]);

  const latitude = point?.latitude ?? null;
  const longitude = point?.longitude ?? null;

  // why: the padding travels with every flight. `setPadding` alone would stop
  // a flight halfway when the panel moves over the map. The view is read
  // through `styledViewRef`, so a view switch turns the camera in place
  // instead of flying back to the address.
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
      ...cameraFor({
        point: pinned,
        overview: {
          latitude: overview.latitude,
          longitude: overview.longitude,
        },
        view: styledViewRef.current,
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
