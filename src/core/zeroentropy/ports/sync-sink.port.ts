import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { EntityChangeEvent } from '../types';

export interface ISyncSink {
  readonly name: string;
  handle(event: EntityChangeEvent): Promise<Result<void, AppError>>;
}
