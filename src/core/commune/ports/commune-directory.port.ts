import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { Commune } from '../types';

export interface ICommuneDirectory {
  findByPostalCode(input: {
    postalCode: string;
  }): Promise<Result<Commune[], AppError>>;

  findByInseeCode(input: {
    inseeCode: string;
  }): Promise<Result<Commune | null, AppError>>;
}
