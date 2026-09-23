import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { ParcelArea } from '../land-surface';

export interface IParcelDirectory {
  areasFor(input: {
    parcelIds: readonly string[];
  }): Promise<Result<ParcelArea[], AppError>>;
}
