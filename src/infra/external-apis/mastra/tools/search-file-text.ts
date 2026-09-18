import 'server-only';

import { createTool } from '@mastra/core/tools';
import * as v from 'valibot';
import { searchFileText } from '@/application/zeroentropy/query-snippets';
import { truncateSnippetsByCharBudget } from '@/core/chat/snippet-truncate';
import { wrapUntrusted } from '@/core/chat/untrusted-wrapper';
import { buildAppUrl } from '@/shared/build-app-url';
import { toolError, toolInput } from './tool-schema';

const InputSchema = v.object({
  fileId: v.pipe(
    v.string(),
    v.minLength(1),
    v.description(
      'The id of the file to search within. Obtain from listFiles or from prior searchUserFiles snippets.',
    ),
  ),
  query: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(2000),
    v.description('Natural-language query, scoped to this single file.'),
  ),
  k: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(50),
      v.description('Maximum number of snippets (default 10).'),
    ),
    10,
  ),
});

export const searchFileTextTool = createTool({
  id: 'searchFileText',
  description:
    'Semantic search inside a SINGLE file. Use when the user references a specific document ("this contract", "the report I just attached") and asks about its content. Returns ranked snippets with page ranges. Use searchUserFiles instead when the file is not yet identified.',
  inputSchema: toolInput(InputSchema),
  execute: async (input) => {
    const result = await searchFileText({
      fileId: input.fileId,
      query: input.query,
      k: input.k ?? 10,
    });
    if (result.isErr()) {
      return toolError('searchFileText', result.error);
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
