import type { ExtractedFieldName } from './types';

type NumericBound = { min: number; max: number };

// why: la route de matching est ouverte, donc son corps n'a pas traverse
// l'extraction. Ces bornes doivent etre rejouables a la frontiere HTTP, d'ou
// leur export — une seule source de verite pour les deux endroits.
export const SURFACE_BOUNDS: NumericBound = { min: 5, max: 2000 };
export const LAND_SURFACE_BOUNDS: NumericBound = { min: 10, max: 1_000_000 };
export const ENERGY_COST_BOUNDS: NumericBound = { min: 10, max: 50_000 };

const STATIC_BOUNDS: Partial<Record<ExtractedFieldName, NumericBound>> = {
  surfaceM2: SURFACE_BOUNDS,
  landSurfaceM2: LAND_SURFACE_BOUNDS,
  rooms: { min: 1, max: 20 },
  bedrooms: { min: 0, max: 15 },
  floor: { min: -2, max: 60 },
  buildingFloors: { min: 0, max: 60 },
  priceEur: { min: 1000, max: 100_000_000 },
  dpeKwhM2Year: { min: 1, max: 2000 },
  gesKgCo2M2Year: { min: 0, max: 1000 },
  annualEnergyCostMinEur: ENERGY_COST_BOUNDS,
  annualEnergyCostMaxEur: ENERGY_COST_BOUNDS,
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
