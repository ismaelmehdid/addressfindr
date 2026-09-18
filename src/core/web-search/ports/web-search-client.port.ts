import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { WebSearchQuery, WebSearchResult } from '../types';

export interface IWebSearchClient {
  search(input: WebSearchQuery): Promise<Result<WebSearchResult[], AppError>>;
}
