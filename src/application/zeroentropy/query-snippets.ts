import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import {
  getFileEntitiesByIds,
  getFileEntityForUser,
} from '@/application/files/get-file-entity';
import { requireOrganizationScope } from '@/application/me/organization-scope';
import { multiQuerySearch } from '@/application/retrieval/multi-query-search';
import { type AppError, parseInput } from '@/core/errors';
import { ZEROENTROPY_CONFIG } from '@/core/zeroentropy/config';
import { postprocessSnippets } from '@/core/zeroentropy/snippet-postprocess';
import { IndexableEntityType } from '@/core/zeroentropy/types';
import { log } from '@/shared/logger';
import {
  addCurrentSpanAttributes,
  withSpan,
} from '@/shared/telemetry/with-span';
import { ensureCollection } from './collection-service';

export const SearchFilesInputSchema = v.object({
  query: v.pipe(v.string(), v.minLength(1), v.maxLength(2000)),
  k: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
    10,
  ),
});

export type SearchFilesInput = v.InferOutput<typeof SearchFilesInputSchema>;

export const SearchFileTextInputSchema = v.object({
  fileId: v.pipe(v.string(), v.minLength(1)),
  query: v.pipe(v.string(), v.minLength(1), v.maxLength(2000)),
  k: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
    10,
  ),
});

export type SearchFileTextInput = v.InferOutput<
  typeof SearchFileTextInputSchema
>;

export type FileSnippet = {
  content: string;
  score: number;
  pageSpan: [number, number] | null;
  source: {
    fileId: string;
    fileName: string | null;
    docType: string;
  };
};

const PATH_PATTERN = /^entities\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/;

function parseDocPath(
  path: string,
): { entityType: string; entityId: string; docType: string } | null {
  const match = PATH_PATTERN.exec(path);
  if (!match) return null;
  const [, , entityType, entityId, docType] = match;
  if (!entityType || !entityId || !docType) return null;
  return { entityType, entityId, docType };
}

export async function searchUserFiles(
  input: SearchFilesInput,
): Promise<Result<FileSnippet[], AppError>> {
  return withSpan({
    name: 'chat.retrieval',
    attributes: {
      'retrieval.engine': 'zeroentropy',
      'retrieval.scope': 'files',
    },
    fn: () => searchUserFilesImpl(input),
  });
}

async function searchUserFilesImpl(
  input: SearchFilesInput,
): Promise<Result<FileSnippet[], AppError>> {
  const parsed = parseInput(
    SearchFilesInputSchema,
    input,
    'Invalid search input',
  );
  if (parsed.isErr()) return err(parsed.error);

  const scope = await requireOrganizationScope();
  if (scope.isErr()) return err(scope.error);

  const collection = await ensureCollection(scope.value.userId);
  if (collection.isErr()) return err(collection.error);

  const snippets = await multiQuerySearch({
    userId: scope.value.userId,
    collectionName: collection.value.collectionName,
    query: parsed.value.query,
    k: parsed.value.k,
    filter: { entityType: { $eq: IndexableEntityType.FILE } },
  });
  if (snippets.isErr()) return err(snippets.error);

  const cleanedSnippets = postprocessSnippets({
    snippets: snippets.value,
    minScore: ZEROENTROPY_CONFIG.retrieval.defaultMinScore,
  });

  addCurrentSpanAttributes({
    'retrieval.query_length': parsed.value.query.length,
    'retrieval.k_requested': parsed.value.k,
    'retrieval.results_raw': snippets.value.length,
    'retrieval.results_after_postprocess': cleanedSnippets.length,
    ...(cleanedSnippets.length > 0
      ? {
          'retrieval.top_score': cleanedSnippets[0]?.score ?? 0,
          'retrieval.bottom_score':
            cleanedSnippets[cleanedSnippets.length - 1]?.score ?? 0,
        }
      : {}),
  });

  const parsedSnippets = cleanedSnippets.map((snippet) => {
    const parsedPath = parseDocPath(snippet.path);
    if (!parsedPath) {
      log.warn('Unparseable ZE result path', { path: snippet.path });
    }
    return { snippet, parsedPath };
  });

  const uniqueIds = Array.from(
    new Set(
      parsedSnippets
        .map((s) => s.parsedPath?.entityId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  );

  const files = await getFileEntitiesByIds({
    ids: uniqueIds,
    userId: scope.value.userId,
  });
  if (files.isErr()) return err(files.error);

  const fileNameById = new Map<string, string>();
  for (const f of files.value) {
    fileNameById.set(f.id, f.originalName);
  }

  const enriched: FileSnippet[] = [];
  for (const { snippet, parsedPath } of parsedSnippets) {
    if (!parsedPath) continue;
    enriched.push({
      content: snippet.content,
      score: snippet.score,
      pageSpan: snippet.pageSpan,
      source: {
        fileId: parsedPath.entityId,
        fileName: fileNameById.get(parsedPath.entityId) ?? null,
        docType: parsedPath.docType,
      },
    });
  }

  return ok(enriched);
}

export async function searchFileText(
  input: SearchFileTextInput,
): Promise<Result<FileSnippet[], AppError>> {
  return withSpan({
    name: 'chat.retrieval',
    attributes: {
      'retrieval.engine': 'zeroentropy',
      'retrieval.scope': 'file-text',
    },
    fn: () => searchFileTextImpl(input),
  });
}

async function searchFileTextImpl(
  input: SearchFileTextInput,
): Promise<Result<FileSnippet[], AppError>> {
  const parsed = parseInput(
    SearchFileTextInputSchema,
    input,
    'Invalid search input',
  );
  if (parsed.isErr()) return err(parsed.error);

  const scope = await requireOrganizationScope();
  if (scope.isErr()) return err(scope.error);

  const file = await getFileEntityForUser({
    fileId: parsed.value.fileId,
    userId: scope.value.userId,
  });
  if (file.isErr()) return err(file.error);

  const collection = await ensureCollection(scope.value.userId);
  if (collection.isErr()) return err(collection.error);

  const snippets = await multiQuerySearch({
    userId: scope.value.userId,
    collectionName: collection.value.collectionName,
    query: parsed.value.query,
    k: parsed.value.k,
    filter: {
      $and: [
        { entityType: { $eq: IndexableEntityType.FILE } },
        { entityId: { $eq: file.value.id } },
      ],
    },
  });
  if (snippets.isErr()) return err(snippets.error);

  const cleanedSnippets = postprocessSnippets({
    snippets: snippets.value,
    minScore: 0,
  });

  log.info('searchFileText results', {
    fileId: file.value.id,
    fileName: file.value.originalName,
    query: parsed.value.query,
    rawCount: snippets.value.length,
    topScore: snippets.value[0]?.score ?? null,
    afterPostprocess: cleanedSnippets.length,
  });

  addCurrentSpanAttributes({
    'retrieval.query_length': parsed.value.query.length,
    'retrieval.k_requested': parsed.value.k,
    'retrieval.results_raw': snippets.value.length,
    'retrieval.results_after_postprocess': cleanedSnippets.length,
    ...(cleanedSnippets.length > 0
      ? {
          'retrieval.top_score': cleanedSnippets[0]?.score ?? 0,
          'retrieval.bottom_score':
            cleanedSnippets[cleanedSnippets.length - 1]?.score ?? 0,
        }
      : {}),
  });

  const enriched: FileSnippet[] = [];
  for (const snippet of cleanedSnippets) {
    const parsedPath = parseDocPath(snippet.path);
    if (!parsedPath) {
      log.warn('Unparseable ZE result path', { path: snippet.path });
      continue;
    }
    if (parsedPath.entityId !== file.value.id) continue;
    enriched.push({
      content: snippet.content,
      score: snippet.score,
      pageSpan: snippet.pageSpan,
      source: {
        fileId: parsedPath.entityId,
        fileName: file.value.originalName,
        docType: parsedPath.docType,
      },
    });
  }

  return ok(enriched);
}
