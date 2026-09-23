import type { ExtractedValues } from '@/core/listing/types';
import {
  type DpeSearchFilter,
  MAX_RECORDS_FETCHED,
  surfaceWindow,
} from './types';

export type SearchRefusal = 'no-commune' | 'no-surface';

// why: sans commune ni surface, le filtre porterait sur des millions de lignes
// et aucun tri ne rattraperait ca. Mieux vaut ne rien chercher.
export function buildDpeSearch(input: {
  inseeCode: string | null;
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
      propertyType: input.values.propertyType,
      surfaceMin: window.min,
      surfaceMax: window.max,
      dpeClass: input.values.dpeClass,
      limit: MAX_RECORDS_FETCHED,
    },
  };
}
