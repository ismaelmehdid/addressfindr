import type { ExtractedFieldName } from './types';

type NumericBound = { min: number; max: number };

const STATIC_BOUNDS: Partial<Record<ExtractedFieldName, NumericBound>> = {
  surfaceM2: { min: 5, max: 2000 },
  rooms: { min: 1, max: 20 },
  bedrooms: { min: 0, max: 15 },
  floor: { min: -2, max: 60 },
  buildingFloors: { min: 0, max: 60 },
  priceEur: { min: 1000, max: 100_000_000 },
  dpeKwhM2Year: { min: 1, max: 2000 },
  gesKgCo2M2Year: { min: 0, max: 1000 },
};

function boundsFor(field: ExtractedFieldName): NumericBound | null {
  if (field === 'yearBuilt') {
    return { min: 1700, max: new Date().getFullYear() + 2 };
  }
  return STATIC_BOUNDS[field] ?? null;
}

export function withinBounds(
  field: ExtractedFieldName,
  value: number,
): boolean {
  const bound = boundsFor(field);
  if (!bound) return true;
  if (!Number.isFinite(value)) return false;
  return value >= bound.min && value <= bound.max;
}
