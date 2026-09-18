import 'server-only';

import { createTool } from '@mastra/core/tools';
import * as v from 'valibot';
import { fetchUrl } from '@/application/url-fetch/fetch-url';
import { truncateTextByCharBudget } from '@/core/chat/snippet-truncate';
import { wrapUntrusted } from '@/core/chat/untrusted-wrapper';
import { URL_FETCH_MAX_BYTES } from '@/core/url-fetch/types';
import { toolError, toolInput } from './tool-schema';

const InputSchema = v.object({
  url: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(2000),
    v.description(
      'A fully-qualified https:// URL to fetch. Private networks, http://, and authenticated URLs are rejected.',
    ),
  ),
});

export const fetchUrlTool = createTool({
  id: 'fetchUrl',
  description: `Fetch the text content of a public https:// URL (HTML, plain text, markdown, JSON, XML). Returns up to ${Math.round(
    URL_FETCH_MAX_BYTES / 1024,
  )} KB of text. Use when you have a specific URL (from webSearch or the user) and need its full content. Not for PDFs or images — use the user's uploaded files instead. Refuses internal and private-network targets.`,
  inputSchema: toolInput(InputSchema),
  execute: async (input) => {
    const result = await fetchUrl({ url: input.url });
    if (result.isErr()) {
      return toolError('fetchUrl', result.error);
    }
    const budgeted = truncateTextByCharBudget(result.value.text);
    return {
      url: result.value.url,
      finalUrl: result.value.finalUrl,
      mediaType: result.value.mediaType,
      text: wrapUntrusted(budgeted.text),
      sizeBytes: result.value.sizeBytes,
      truncated: result.value.truncated || budgeted.truncated,
    };
  },
});
