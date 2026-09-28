export type MapView = 'map' | 'satellite';

export const DEFAULT_MAP_VIEW: MapView = 'map';

// why: Mapbox v3's Standard styles draw their own buildings and do not expose
// the "composite" source the buildings layer reads, so it is rejected there.
// The classic styles keep it: light-v11's light background follows DESIGN.md,
// and satellite-streets-v12 goes without the layer, whose grey extrusions
// would hide the real roofs in the imagery.
const MAP_STYLES: Record<MapView, { url: string; buildings: boolean }> = {
  map: { url: 'mapbox://styles/mapbox/light-v11', buildings: true },
  satellite: {
    url: 'mapbox://styles/mapbox/satellite-streets-v12',
    buildings: false,
  },
};

export function mapStyleUrl(view: MapView): string {
  return MAP_STYLES[view].url;
}

export function showsBuildings(view: MapView): boolean {
  return MAP_STYLES[view].buildings;
}

// why: a single-choice toggle group reports an empty value when its pressed
// option is pressed again; the map always shows one view, so that is no pick.
export function pickedMapView(values: readonly string[]): MapView | null {
  const [picked] = values;
  return picked === 'map' || picked === 'satellite' ? picked : null;
}
