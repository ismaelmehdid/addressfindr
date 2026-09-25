import type { ExtractedValues } from '@/core/listing/types';
import {
  type DpeDateSearchFilter,
  type DpeSearchFilter,
  FIRST_REGISTERED_DPE_DATE,
  MAX_RECORDS_FETCHED,
  surfaceWindow,
} from './types';

export type SearchRefusal = 'no-commune' | 'no-surface';

// why: sans commune ni surface, le filtre porterait sur des millions de lignes
// et aucun tri ne rattraperait ca. Mieux vaut ne rien chercher.
export function buildDpeSearch(input: {
  inseeCode: string | null;
  postalCodes: readonly string[];
  values: Pick<ExtractedValues, 'propertyType' | 'surfaceM2' | 'dpeClass'>;
}):
  | { ok: true; filter: DpeSearchFilter }
  | { ok: false; reason: SearchRefusal } {
  if (input.inseeCode === null) return { ok: false, reason: 'no-commune' };

  const { surfaceM2 } = input.values;
  if (surfaceM2 === null) return { ok: false, reason: 'no-surface' };

  const window = surfaceWindow(surfaceM2);

  return {
    ok: true,
    filter: {
      inseeCode: input.inseeCode,
      postalCodes: input.postalCodes,
      propertyType: input.values.propertyType,
      surfaceMin: window.min,
      surfaceMax: window.max,
      dpeClass: input.values.dpeClass,
      limit: MAX_RECORDS_FETCHED,
    },
  };
}

// why: overseas departments carry three digits (974 for Reunion), Corsica a
// letter (2A, 2B). Everywhere else the department is the first two characters.
export function departmentOfInseeCode(inseeCode: string): string {
  return inseeCode.startsWith('97')
    ? inseeCode.slice(0, 3)
    : inseeCode.slice(0, 2);
}

// why: measured 2026-09-24, a listing can name the wrong commune — a house
// described as "a Melesse" was listed under Rennes. The exact DPE date is
// selective enough to search the whole department: date, type and letter
// alone leave 8 rows in Ille-et-Vilaine before the surface window applies.
export function buildDateSearch(input: {
  inseeCode: string | null;
  values: Pick<
    ExtractedValues,
    'propertyType' | 'surfaceM2' | 'dpeClass' | 'dpeDate'
  >;
}): DpeDateSearchFilter | null {
  const { dpeDate, surfaceM2 } = input.values;
  if (input.inseeCode === null || dpeDate === null || surfaceM2 === null) {
    return null;
  }
  if (dpeDate < FIRST_REGISTERED_DPE_DATE) return null;
  const window = surfaceWindow(surfaceM2);
  return {
    departmentCode: departmentOfInseeCode(input.inseeCode),
    dpeDate,
    propertyType: input.values.propertyType,
    surfaceMin: window.min,
    surfaceMax: window.max,
    dpeClass: input.values.dpeClass,
    limit: MAX_RECORDS_FETCHED,
  };
}
