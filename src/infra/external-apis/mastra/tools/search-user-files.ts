import 'server-only';

import { createTool } from '@mastra/core/tools';
import * as v from 'valibot';
import { searchUserFiles } from '@/application/zeroentropy/query-snippets';
import { truncateSnippetsByCharBudget } from '@/core/chat/snippet-truncate';
import { wrapUntrusted } from '@/core/chat/untrusted-wrapper';
import { buildAppUrl } from '@/shared/build-app-url';
import { toolError, toolInput } from './tool-schema';

const InputSchema = v.object({
  query: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(2000),
    v.description("The user's natural-language search query."),
  ),
  k: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(50),
      v.description('Maximum number of snippets to return (default 10).'),
    ),
    10,
  ),
});

export const searchUserFilesTool = createTool({
  id: 'searchUserFiles',
  description:
    "Search across the user's UPLOADED files (PDFs, DOCX, images, CSVs, JSON, text) — including reports, contracts and spec sheets — using semantic search. Returns ranked text snippets with citations. Use this for any question about the content of an uploaded file.",
  inputSchema: toolInput(InputSchema),
  execute: async (input) => {
    const result = await searchUserFiles({
      query: input.query,
      k: input.k ?? 10,
    });
    if (result.isErr()) {
      return toolError('searchUserFiles', result.error);
    }
    const truncated = truncateSnippetsByCharBudget(result.value);
    return {
      snippets: truncated.items.map((s) => ({
        content: wrapUntrusted(s.content),
        score: s.score,
        fileId: s.source.fileId,
        fileName: s.source.fileName,
        docType: s.source.docType,
        pageStart: s.pageSpan ? s.pageSpan[0] : null,
        pageEnd: s.pageSpan ? s.pageSpan[1] : null,
        url: buildAppUrl(`/dashboard/storage/${s.source.fileId}`),
      })),
      ...(truncated.truncated
        ? { _truncatedCount: truncated.droppedCount }
        : {}),
    };
  },
});
