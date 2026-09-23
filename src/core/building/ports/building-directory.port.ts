import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { BuildingFacts } from '../types';

export interface IBuildingDirectory {
  factsForAddresses(input: {
    banIds: readonly string[];
  }): Promise<Result<BuildingFacts[], AppError>>;
}
