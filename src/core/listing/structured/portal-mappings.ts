import type { GeoPoint } from '@/core/geo/types';
import { withinBounds } from '../field-bounds';
import {
  parseCity,
  parseCount,
  parsePostalCode,
  parsePropertyType,
} from '../parse-values';
import {
  ENERGY_CLASSES,
  type EnergyClass,
  type ExtractedValues,
  type HeatingEnergy,
  type PortalId,
} from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const RELATED_LISTING_KEYS = new Set([
  'similar',
  'similar_ads',
  'related',
  'recommendations',
]);

// why: le noeud annonce se reconnait a son tableau `attributes`, mais un bloc
// "annonces similaires" porte la meme forme. Un parcours en profondeur peut
// donc rendre le DPE du voisin. En largeur, le plus proche de la racine gagne,
// et on ne descend pas du tout dans les conteneurs d'annonces liees.
function findAdNode(payload: unknown): Record<string, unknown> | null {
  const queue: unknown[] = [payload];
  while (queue.length > 0) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (!isRecord(current)) continue;
    if (Array.isArray(current.attributes)) return current;
    for (const [key, value] of Object.entries(current)) {
      if (RELATED_LISTING_KEYS.has(key)) continue;
      queue.push(value);
    }
  }
  return null;
}

function toEnergyClass(raw: unknown): EnergyClass | null {
  if (typeof raw !== 'string') return null;
  const letter = raw.trim().toUpperCase();
  return (ENERGY_CLASSES as readonly string[]).includes(letter)
    ? (letter as EnergyClass)
    : null;
}

function setNumeric(
  values: Partial<ExtractedValues>,
  field:
    | 'surfaceM2'
    | 'landSurfaceM2'
    | 'rooms'
    | 'bedrooms'
    | 'floor'
    | 'buildingFloors'
    | 'yearBuilt'
    | 'annualEnergyCostMinEur'
    | 'annualEnergyCostMaxEur',
  raw: unknown,
): void {
  if (typeof raw !== 'string' && typeof raw !== 'number') return;
  const parsed = parseCount(String(raw));
  if (parsed === null || !withinBounds(field, parsed)) return;
  values[field] = parsed;
}

// why: only values observed on real listings are translated. `other` covers a
// heat pump as well as wood: guessing would rule out the right ADEME row on an
// energy the listing never states.
const LEBONCOIN_HEATING: Record<string, HeatingEnergy> = {
  gas: 'gas',
  electric: 'electricity',
};

// why: the label prints a range around the cost ADEME publishes. A single
// bound, or inverted bounds, no longer locate that cost.
function setEnergyCostRange(
  values: Partial<ExtractedValues>,
  rawMin: unknown,
  rawMax: unknown,
): void {
  const bounds: Partial<ExtractedValues> = {};
  setNumeric(bounds, 'annualEnergyCostMinEur', rawMin);
  setNumeric(bounds, 'annualEnergyCostMaxEur', rawMax);
  const min = bounds.annualEnergyCostMinEur;
  const max = bounds.annualEnergyCostMaxEur;
  if (min == null || max == null || min >= max) return;
  values.annualEnergyCostMinEur = min;
  values.annualEnergyCostMaxEur = max;
}

function mapLeboncoin(payload: unknown): Partial<ExtractedValues> {
  const ad = findAdNode(payload);
  if (!ad) return {};
  const values: Partial<ExtractedValues> = {};
  let energyCostMin: unknown = null;
  let energyCostMax: unknown = null;

  if (typeof ad.list_id === 'number' || typeof ad.list_id === 'string') {
    values.listingId = String(ad.list_id);
  }

  const attributes = Array.isArray(ad.attributes) ? ad.attributes : [];
  for (const attribute of attributes) {
    if (!isRecord(attribute)) continue;
    const key = typeof attribute.key === 'string' ? attribute.key : '';
    const value = attribute.value;
    const label = attribute.value_label;

    if (key === 'square') setNumeric(values, 'surfaceM2', value);
    else if (key === 'land_plot_surface') {
      setNumeric(values, 'landSurfaceM2', value);
    } else if (key === 'heating_mode' && typeof value === 'string') {
      const energy = LEBONCOIN_HEATING[value];
      if (energy) values.heatingEnergy = energy;
    } else if (key === 'annual_energy_budget_min') energyCostMin = value;
    else if (key === 'annual_energy_budget_max') energyCostMax = value;
    else if (key === 'rooms') setNumeric(values, 'rooms', value);
    else if (key === 'bedrooms') setNumeric(values, 'bedrooms', value);
    else if (key === 'floor_number') setNumeric(values, 'floor', value);
    else if (key === 'nb_floors_building') {
      setNumeric(values, 'buildingFloors', value);
    } else if (key === 'building_year') setNumeric(values, 'yearBuilt', value);
    else if (key === 'energy_rate') {
      const parsed = toEnergyClass(value);
      if (parsed) values.dpeClass = parsed;
    } else if (key === 'ges') {
      const parsed = toEnergyClass(value);
      if (parsed) values.gesClass = parsed;
    } else if (key === 'real_estate_type' && typeof label === 'string') {
      const parsed = parsePropertyType(label);
      if (parsed) values.propertyType = parsed;
    }
  }

  setEnergyCostRange(values, energyCostMin, energyCostMax);

  const location = ad.location;
  if (isRecord(location)) {
    if (typeof location.city === 'string') {
      const city = parseCity(location.city);
      if (city) values.city = city;
    }
    if (typeof location.zipcode === 'string') {
      const postal = parsePostalCode(location.zipcode);
      if (postal) values.postalCode = postal;
    }
  }

  return values;
}

const MAPPERS: Partial<
  Record<PortalId, (payload: unknown) => Partial<ExtractedValues>>
> = {
  leboncoin: mapLeboncoin,
};

// why: Firecrawl cuts the leboncoin description at "Voir plus". The DPE date
// and its numeric values live in the rest, which only the hydration payload
// carries in full.
const DESCRIPTION_READERS: Partial<
  Record<PortalId, (payload: unknown) => string | null>
> = {
  leboncoin: (payload) => {
    const body = findAdNode(payload)?.body;
    return typeof body === 'string' && body.trim().length > 0 ? body : null;
  },
};

export function mapHydrationDescription(
  portal: PortalId,
  payload: unknown,
): string | null {
  if (payload === null || payload === undefined) return null;
  return DESCRIPTION_READERS[portal]?.(payload) ?? null;
}

// why: leboncoin places its pin either from an address the seller typed or on
// the town. Only the first says where the dwelling is, and only when it is a
// point rather than a drawn shape.
const PIN_READERS: Partial<
  Record<PortalId, (payload: unknown) => GeoPoint | null>
> = {
  leboncoin: (payload) => {
    const location = findAdNode(payload)?.location;
    if (!isRecord(location)) return null;
    if (location.source !== 'address' || location.is_shape !== false) {
      return null;
    }
    const { lat, lng } = location;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng };
  },
};

export function mapHydrationPin(
  portal: PortalId,
  payload: unknown,
): GeoPoint | null {
  if (payload === null || payload === undefined) return null;
  return PIN_READERS[portal]?.(payload) ?? null;
}

export function mapHydrationToValues(
  portal: PortalId,
  payload: unknown,
): Partial<ExtractedValues> {
  if (payload === null || payload === undefined) return {};
  const mapper = MAPPERS[portal];
  if (!mapper) return {};
  return mapper(payload);
}
