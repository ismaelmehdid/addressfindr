import 'server-only';

import { createTool } from '@mastra/core/tools';
import * as v from 'valibot';
import { listFiles } from '@/application/files/list-files';
import { buildAppUrl } from '@/shared/build-app-url';
import { toolError, toolInput } from './tool-schema';

const TOOL_PAGE_SIZE = 25;

const InputSchema = v.object({
  page: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.maxValue(100),
      v.description('Zero-based page index (default 0).'),
    ),
    0,
  ),
});

export const listFilesTool = createTool({
  id: 'listFiles',
  description:
    'List files in the user\'s workspace, newest first. Returns id, original filename, mime type, size in bytes, and creation timestamp for each file. Use when the user asks what files they have (e.g. "what reports did I upload?", "list my PDFs"). For content questions use searchUserFiles instead.',
  inputSchema: toolInput(InputSchema),
  execute: async (input) => {
    const result = await listFiles({
      page: input.page ?? 0,
      perPage: TOOL_PAGE_SIZE,
    });
    if (result.isErr()) {
      return toolError('listFiles', result.error);
    }
    return {
      files: result.value.items.map((f) => ({
        id: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        createdAt: f.createdAt,
        url: buildAppUrl(`/dashboard/storage/${f.id}`),
      })),
      hasMore: result.value.hasMore,
      page: result.value.page,
    };
  },
});
