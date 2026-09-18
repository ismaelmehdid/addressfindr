import * as v from 'valibot';
import {
  WEB_SEARCH_DEFAULT_COUNT,
  WEB_SEARCH_MAX_COUNT,
  WEB_SEARCH_MIN_COUNT,
} from '@/core/web-search/types';

export const SearchWebInputSchema = v.object({
  query: v.pipe(v.string(), v.minLength(1), v.maxLength(400)),
  count: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(WEB_SEARCH_MIN_COUNT),
      v.maxValue(WEB_SEARCH_MAX_COUNT),
    ),
    WEB_SEARCH_DEFAULT_COUNT,
  ),
});

export type SearchWebInput = v.InferInput<typeof SearchWebInputSchema>;

export type WebSearchResultDto = {
  title: string;
  url: string;
  description: string;
};
