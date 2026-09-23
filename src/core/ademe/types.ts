import type {
  EnergyClass,
  HeatingEnergy,
  PropertyType,
} from '@/core/listing/types';

export const DPE_REGISTERS = ['existing', 'new'] as const;
export type DpeRegister = (typeof DPE_REGISTERS)[number];

export type DpeRecord = {
  dpeNumber: string;
  dataset: DpeRegister;
  banId: string | null;
  address: string;
  streetNumber: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  inseeCode: string;
  propertyType: PropertyType | null;
  surfaceM2: number | null;
  dpeClass: EnergyClass | null;
  gesClass: EnergyClass | null;
  dpeKwhM2Year: number | null;
  gesKgCo2M2Year: number | null;
  heatingEnergy: HeatingEnergy | null;
  yearBuilt: number | null;
  buildingFloors: number | null;
  landSurfaceM2: number | null;
  floor: number | null;
  buildingComplement: string | null;
  establishedOn: string | null;
  geocodingScore: number | null;
};

export type DpeSearchFilter = {
  inseeCode: string;
  propertyType: PropertyType | null;
  surfaceMin: number;
  surfaceMax: number;
  dpeClass: EnergyClass | null;
  limit: number;
};

export type MatchSignal =
  | 'surfaceM2'
  | 'dpeClass'
  | 'gesClass'
  | 'dpeKwhM2Year'
  | 'gesKgCo2M2Year'
  | 'heatingEnergy'
  | 'yearBuilt'
  | 'buildingFloors'
  | 'landSurfaceM2'
  | 'floor';

export type AddressCandidate = {
  record: DpeRecord;
  confidence: number;
  matched: readonly MatchSignal[];
  diverged: readonly MatchSignal[];
  supportingRecords: number;
};

export type MatchRefusal = 'insufficient-evidence';

export type AddressMatch = {
  candidates: readonly AddressCandidate[];
  inspected: number;
  truncated: boolean;
  refusedFor: MatchRefusal | null;
};

// why: l'API data-fair accepte size jusqu'a 10000 (10001 rend un 400). Lyon 3e,
// l'arrondissement le plus dense mesure, rend 972 lignes pour un appartement
// DPE D a 5% de tolerance de surface, donc 2000 couvre le pire cas observe
// sans ramener un corpus entier.
export const MAX_RECORDS_FETCHED = 2000;
export const MAX_CANDIDATES_RETURNED = 10;

// why: la surface de l'annonce est habitable ou Carrez, celle de l'ADEME est
// habitable. Les deux divergent legerement, d'ou une fenetre plutot qu'une
// egalite. Elle reste etroite : mesure du 2026-09-22, Lyon 3e appartement
// DPE D, 60-66 m2 rend 972 lignes contre 149 pour 62,5-63,5.
const SURFACE_TOLERANCE_RATIO = 0.03;
const SURFACE_TOLERANCE_MIN_M2 = 2;

export function surfaceWindow(surfaceM2: number): {
  min: number;
  max: number;
} {
  const tolerance = Math.max(
    SURFACE_TOLERANCE_MIN_M2,
    surfaceM2 * SURFACE_TOLERANCE_RATIO,
  );
  return { min: surfaceM2 - tolerance, max: surfaceM2 + tolerance };
}
