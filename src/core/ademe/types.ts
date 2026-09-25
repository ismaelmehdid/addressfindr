import type { GeoPoint } from '@/core/geo/types';
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
  visitedOn: string | null;
  annualEnergyCostEur: number | null;
  geocodingScore: number | null;
  point: GeoPoint | null;
};

// why: a row ADEME never matched to the national address register carries
// only the address the diagnostician typed. It is not an address the product
// may show until the register recognises it, so it lives in its own type.
export type UnverifiedDpeRecord = Omit<
  DpeRecord,
  | 'banId'
  | 'address'
  | 'streetNumber'
  | 'street'
  | 'postalCode'
  | 'city'
  | 'inseeCode'
  | 'geocodingScore'
  | 'point'
> & {
  rawStreet: string;
  rawPostalCode: string | null;
  rawCity: string | null;
};

export type DpeSearchFilter = {
  inseeCode: string;
  postalCodes: readonly string[];
  propertyType: PropertyType | null;
  surfaceMin: number;
  surfaceMax: number;
  dpeClass: EnergyClass | null;
  limit: number;
};

// why: both DPE registers hold diagnostics issued under the method in force
// since 2021-07-01. An older date can match no row.
export const FIRST_REGISTERED_DPE_DATE = '2021-07-01';

export type DpeDateSearchFilter = {
  departmentCode: string;
  dpeDate: string;
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
  | 'floor'
  | 'annualEnergyCost'
  | 'dpeDate'
  | 'pinDistance';

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

// why: the data-fair API accepts size up to 10000 (10001 returns a 400).
// Measured 2026-09-24 at a 12 % surface tolerance: Paris 15e, 40 m2 apartment
// with DPE D, returns 3936 rows from the existing register, read in 3.6 s;
// Lyon 3e at 63 m2 returns 2069. 5000 covers the worst case observed.
export const MAX_RECORDS_FETCHED = 5000;
export const MAX_CANDIDATES_RETURNED = 10;

// why: the listing surface is living, Carrez or total area; ADEME's is living
// area. Measured 2026-09-24 against precisement.fr on 25 leboncoin listings:
// the row they designate sits at 0.89 to 1.08 times the listed surface (133.8
// m2 for 150, 110 for 123, 193.8 for 210). At 3 %, six of those rows were never
// fetched. The window is therefore wide, and ranking — cost, date, DPE values —
// decides.
const SURFACE_TOLERANCE_RATIO = 0.12;
const SURFACE_TOLERANCE_MIN_M2 = 2;

export function surfaceWindow(surfaceM2: number): {
  min: number;
  max: number;
} {
  const tolerance = Math.max(
    SURFACE_TOLERANCE_MIN_M2,
    surfaceM2 * SURFACE_TOLERANCE_RATIO,
  );
  // why: une borne basse negative part telle quelle dans la requete Lucene, et
  // l'ADEME la rejette — `surface_habitable_logement:[-1.00 TO 3.00]` rend un
  // HTTP 400 sur le signe moins, que l'utilisateur lit comme une panne du
  // registre. Une surface negative n'a de toute facon aucun sens.
  return {
    min: Math.max(0, surfaceM2 - tolerance),
    max: surfaceM2 + tolerance,
  };
}
