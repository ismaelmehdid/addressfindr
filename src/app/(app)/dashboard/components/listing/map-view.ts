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

export type CameraTarget = 'address' | 'overview';

export type CameraAngle = Readonly<{ pitch: number; bearing: number }>;

const TOP_DOWN: CameraAngle = { pitch: 0, bearing: 0 };

// why: satellite imagery is shot from straight above, so tilting it only
// stretches the roofs; that view looks straight down, north up.
const ADDRESS_ANGLES: Record<MapView, CameraAngle> = {
  map: { pitch: 45, bearing: -17.6 },
  satellite: TOP_DOWN,
};

export function cameraAngle(view: MapView, target: CameraTarget): CameraAngle {
  return target === 'address' ? ADDRESS_ANGLES[view] : TOP_DOWN;
}

// why: a single-choice toggle group reports an empty value when its pressed
// option is pressed again; the map always shows one view, so that is no pick.
export function pickedMapView(values: readonly string[]): MapView | null {
  const [picked] = values;
  return picked === 'map' || picked === 'satellite' ? picked : null;
}
