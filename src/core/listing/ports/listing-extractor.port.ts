import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { ExtractedFieldName } from '../types';

export type ListingQuotes = Partial<Record<ExtractedFieldName, string>>;

export interface IListingExtractor {
  extractQuotes(input: {
    markdown: string;
    missing: readonly ExtractedFieldName[];
  }): Promise<Result<ListingQuotes, AppError>>;
}
