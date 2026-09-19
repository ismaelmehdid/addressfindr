import * as v from 'valibot';
import type { ExtractedListing } from '@/core/listing/types';

export const ExtractListingInputSchema = v.object({
  url: v.pipe(v.string(), v.minLength(1), v.maxLength(2000)),
});

export type ExtractListingInput = v.InferOutput<
  typeof ExtractListingInputSchema
>;

export type ExtractedListingDto = ExtractedListing;
