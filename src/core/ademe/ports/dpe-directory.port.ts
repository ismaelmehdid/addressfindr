import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { DpeRecord, DpeSearchFilter } from '../types';

export interface IDpeDirectory {
  search(
    filter: DpeSearchFilter,
  ): Promise<Result<{ records: DpeRecord[]; total: number }, AppError>>;
}
