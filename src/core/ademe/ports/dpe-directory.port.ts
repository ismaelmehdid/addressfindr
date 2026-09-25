import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type {
  DpeDateSearchFilter,
  DpeRecord,
  DpeSearchFilter,
  UnverifiedDpeRecord,
} from '../types';

export interface IDpeDirectory {
  // why: seul l'adaptateur sait si un registre a rendu moins que ce qu'il
  // avait. `size` s'applique par registre, donc additionner les totaux et
  // comparer la somme au plafond compare deux echelles differentes. Le
  // verdict remonte ici plutot que d'etre recalcule par l'appelant.
  search(filter: DpeSearchFilter): Promise<
    Result<
      {
        records: DpeRecord[];
        unverified: UnverifiedDpeRecord[];
        total: number;
        truncated: boolean;
      },
      AppError
    >
  >;

  // why: searches a whole department on the exact DPE date, for a listing
  // that names the wrong commune. Never cached: it runs only when the
  // commune search found no row carrying the listing's date.
  searchByDate(
    filter: DpeDateSearchFilter,
  ): Promise<
    Result<
      { records: DpeRecord[]; total: number; truncated: boolean },
      AppError
    >
  >;
}
