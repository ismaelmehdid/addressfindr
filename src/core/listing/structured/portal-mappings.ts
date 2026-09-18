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
    | 'rooms'
    | 'bedrooms'
    | 'floor'
    | 'buildingFloors'
    | 'yearBuilt',
  raw: unknown,
): void {
  if (typeof raw !== 'string' && typeof raw !== 'number') return;
  const parsed = parseCount(String(raw));
  if (parsed === null || !withinBounds(field, parsed)) return;
  values[field] = parsed;
}

function mapLeboncoin(payload: unknown): Partial<ExtractedValues> {
  const ad = findAdNode(payload);
  if (!ad) return {};
  const values: Partial<ExtractedValues> = {};

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

export function mapHydrationToValues(
  portal: PortalId,
  payload: unknown,
): Partial<ExtractedValues> {
  if (payload === null || payload === undefined) return {};
  const mapper = MAPPERS[portal];
  if (!mapper) return {};
  return mapper(payload);
}
