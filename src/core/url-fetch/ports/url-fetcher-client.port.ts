import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { FetchedUrlContent, FetchUrlInput } from '../types';

export interface IUrlFetcherClient {
  fetch(input: FetchUrlInput): Promise<Result<FetchedUrlContent, AppError>>;
}
