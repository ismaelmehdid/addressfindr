import 'server-only';

import { createTool } from '@mastra/core/tools';
import * as v from 'valibot';
import { searchWeb } from '@/application/web-search/search-web';
import { wrapUntrusted } from '@/core/chat/untrusted-wrapper';
import {
  WEB_SEARCH_DEFAULT_COUNT,
  WEB_SEARCH_MAX_COUNT,
  WEB_SEARCH_MIN_COUNT,
} from '@/core/web-search/types';
import { toolError, toolInput } from './tool-schema';

const InputSchema = v.object({
  query: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(400),
    v.description(
      'The web search query in natural language. Be specific and include relevant context (e.g. dates, regions).',
    ),
  ),
  count: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(WEB_SEARCH_MIN_COUNT),
      v.maxValue(WEB_SEARCH_MAX_COUNT),
      v.description(
        `Maximum number of results to return (1-${WEB_SEARCH_MAX_COUNT}, default ${WEB_SEARCH_DEFAULT_COUNT}).`,
      ),
    ),
    WEB_SEARCH_DEFAULT_COUNT,
  ),
});

export const webSearchTool = createTool({
  id: 'webSearch',
  description:
    "Search the public web via Brave Search. Returns ranked results with title, URL, and a short description. Use this for current events, prices, regulations, or any question whose answer is not in the user's uploaded files. Pair with fetchUrl when you need the full text of a result.",
  inputSchema: toolInput(InputSchema),
  execute: async (input) => {
    const result = await searchWeb({
      query: input.query,
      count: input.count ?? WEB_SEARCH_DEFAULT_COUNT,
    });
    if (result.isErr()) {
      return toolError('webSearch', result.error);
    }
    return {
      results: result.value.map((r) => ({
        title: r.title,
        url: r.url,
        description: wrapUntrusted(r.description),
      })),
    };
  },
});
