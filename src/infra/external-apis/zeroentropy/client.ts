import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import pLimit from 'p-limit';
import * as v from 'valibot';
import { type AppError, externalApi, notFound, unknown } from '@/core/errors';
import {
  DeleteDocumentResponseSchema,
  type DocumentInfo,
  GetDocumentInfoListResponseSchema,
  GetStatusResponseSchema,
  ListCollectionsResponseSchema,
  SuccessMessageResponseSchema,
  TopDocumentsResponseSchema,
  TopSnippetsResponseSchema,
  ZeroEntropyErrorResponseSchema,
} from '@/core/zeroentropy/api-schemas';
import {
  ZEROENTROPY_CONFIG,
  type ZeroEntropyRerankerModel,
} from '@/core/zeroentropy/config';
import {
  ZeroEntropyError,
  ZeroEntropyErrorCode,
} from '@/core/zeroentropy/error-codes';
import { encodeMetadataForWire } from '@/core/zeroentropy/metadata-encoding';
import type {
  IZeroEntropyClient,
  ZeroEntropyCollectionStatus,
  ZeroEntropyFailedDocument,
  ZeroEntropyQueryFilter,
} from '@/core/zeroentropy/ports/zeroentropy-client.port';
import {
  type EntityToIndex,
  ZeroEntropyContentKind,
  type ZeroEntropyDocumentInfo,
  type ZeroEntropySnippet,
} from '@/core/zeroentropy/types';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';
import { zeroEntropyCircuitBreaker } from './circuit-breaker';

const PROVIDER = 'zeroentropy';

const limit = pLimit(ZEROENTROPY_CONFIG.concurrency);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toAppError(e: unknown): AppError {
  if (e instanceof ZeroEntropyError) {
    switch (e.code) {
      case ZeroEntropyErrorCode.COLLECTION_NOT_FOUND:
        return notFound(e.message, 'collection');
      case ZeroEntropyErrorCode.DOCUMENT_NOT_FOUND:
        return notFound(e.message, 'document');
      default:
        return externalApi(PROVIDER, `${e.code}: ${e.message}`);
    }
  }
  if (e instanceof Error) {
    return externalApi(PROVIDER, e.message);
  }
  return unknown('Unknown ZeroEntropy error');
}

async function readErrorDetail(
  response: Response,
): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    const parsed = v.safeParse(ZeroEntropyErrorResponseSchema, body);
    if (parsed.success) {
      if (typeof parsed.output.detail === 'string') return parsed.output.detail;
      return parsed.output.detail
        .map((d) => `${d.loc.join('.')}: ${d.msg}`)
        .join('; ');
    }
  } catch {
    try {
      return await response.text();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function throwFromResponse(
  response: Response,
  endpoint: string,
): Promise<never> {
  const detail = await readErrorDetail(response);

  if (response.status === 401) {
    throw new ZeroEntropyError({
      code: ZeroEntropyErrorCode.INVALID_API_KEY,
      message: detail ?? 'Invalid API key',
      statusCode: 401,
    });
  }
  if (response.status === 429) {
    throw new ZeroEntropyError({
      code: ZeroEntropyErrorCode.RATE_LIMITED,
      message: detail ?? 'Rate limit exceeded',
      statusCode: 429,
    });
  }
  if (response.status === 404) {
    const isDocument = /document/i.test(detail ?? '');
    throw new ZeroEntropyError({
      code: isDocument
        ? ZeroEntropyErrorCode.DOCUMENT_NOT_FOUND
        : ZeroEntropyErrorCode.COLLECTION_NOT_FOUND,
      message: detail ?? 'Resource not found',
      statusCode: 404,
    });
  }
  if (response.status === 409) {
    throw new ZeroEntropyError({
      code: ZeroEntropyErrorCode.API_ERROR,
      message: detail ?? 'Resource already exists',
      statusCode: 409,
    });
  }

  log.error(
    'ZeroEntropy: API request failed',
    new Error(`${response.status} ${response.statusText}`),
    { endpoint, status: response.status, detail },
  );
  throw new ZeroEntropyError({
    code: ZeroEntropyErrorCode.API_ERROR,
    message: detail ?? `API request failed: ${response.statusText}`,
    statusCode: response.status,
  });
}

async function rawRequest<T>(args: {
  endpoint: string;
  body: unknown;
  schema: v.GenericSchema<T>;
}): Promise<T> {
  const e = env();
  if (!e.ZEROENTROPY_API_KEY) {
    // 412, not 503: a missing key is permanent config, so it must not trip the
    // circuit breaker that guards against real ZeroEntropy outages.
    throw new ZeroEntropyError({
      code: ZeroEntropyErrorCode.NOT_CONFIGURED,
      message: 'ZEROENTROPY_API_KEY is not set: retrieval is disabled',
      statusCode: 412,
    });
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    ZEROENTROPY_CONFIG.requestTimeoutMs,
  );

  try {
    const response = await fetch(`${e.ZEROENTROPY_API_URL}${args.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${e.ZEROENTROPY_API_KEY}`,
      },
      body: JSON.stringify(args.body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) await throwFromResponse(response, args.endpoint);

    const data: unknown = await response.json();
    const parsed = v.safeParse(args.schema, data);
    if (!parsed.success) {
      log.error(
        'ZeroEntropy: response validation failed',
        new Error('Schema validation failed'),
        { endpoint: args.endpoint, issues: parsed.issues, data },
      );
      throw new ZeroEntropyError({
        code: ZeroEntropyErrorCode.VALIDATION_ERROR,
        message: `Invalid response from API`,
        statusCode: 500,
      });
    }
    return parsed.output;
  } catch (caught) {
    clearTimeout(timeoutId);
    if (caught instanceof ZeroEntropyError) throw caught;
    if (caught instanceof Error && caught.name === 'AbortError') {
      throw new ZeroEntropyError({
        code: ZeroEntropyErrorCode.TIMEOUT,
        message: 'Request timeout',
        statusCode: 408,
      });
    }
    throw new ZeroEntropyError({
      code: ZeroEntropyErrorCode.NETWORK_ERROR,
      message: `Network error: ${caught instanceof Error ? caught.message : 'Unknown'}`,
      statusCode: 500,
      cause: caught,
    });
  }
}

async function requestWithRetry<T>(args: {
  endpoint: string;
  body: unknown;
  schema: v.GenericSchema<T>;
  retryCount: number;
}): Promise<T> {
  if (await zeroEntropyCircuitBreaker.isOpen()) {
    throw new ZeroEntropyError({
      code: ZeroEntropyErrorCode.CIRCUIT_OPEN,
      message: 'Circuit breaker open',
      statusCode: 503,
    });
  }

  try {
    const result = await rawRequest({
      endpoint: args.endpoint,
      body: args.body,
      schema: args.schema,
    });
    await zeroEntropyCircuitBreaker.recordSuccess();
    return result;
  } catch (error) {
    if (error instanceof ZeroEntropyError && error.statusCode >= 500) {
      await zeroEntropyCircuitBreaker.recordFailure();
    }
    if (
      error instanceof ZeroEntropyError &&
      error.statusCode === 429 &&
      args.retryCount < ZEROENTROPY_CONFIG.rateLimitMaxRetries
    ) {
      const delayMs =
        ZEROENTROPY_CONFIG.rateLimitBaseDelayMs * 2 ** args.retryCount;
      log.warn('ZeroEntropy: rate limited, retrying', {
        endpoint: args.endpoint,
        retryCount: args.retryCount,
        delayMs,
      });
      await sleep(delayMs);
      return requestWithRetry({
        ...args,
        retryCount: args.retryCount + 1,
      });
    }
    throw error;
  }
}

function makeRequest<T>(args: {
  endpoint: string;
  body: unknown;
  schema: v.GenericSchema<T>;
}): Promise<T> {
  return limit(() => requestWithRetry({ ...args, retryCount: 0 }));
}

function buildAddDocumentBody(args: {
  collectionName: string;
  document: EntityToIndex;
}): Record<string, unknown> {
  const c = args.document.content;
  let content: Record<string, unknown>;
  switch (c.kind) {
    case ZeroEntropyContentKind.TEXT:
      content = { type: 'text', text: c.text };
      break;
    case ZeroEntropyContentKind.TEXT_PAGES_UNORDERED:
      content = { type: 'text-pages-unordered', pages: c.pages };
      break;
    case ZeroEntropyContentKind.AUTO:
      content = { type: 'auto', base64_data: c.base64Data };
      break;
  }
  return {
    collection_name: args.collectionName,
    path: documentPath(args.document),
    content,
    metadata: encodeMetadataForWire(args.document.metadata),
  };
}

function documentPath(d: EntityToIndex): string {
  return `entities/${d.organizationId}/${d.entityType}/${d.entityId}/${d.docType}`;
}

function mapDocumentInfo(doc: DocumentInfo): ZeroEntropyDocumentInfo {
  return { path: doc.path, metadata: doc.metadata };
}

async function createCollection(
  collectionName: string,
): Promise<Result<void, AppError>> {
  log.info('ZeroEntropy: creating collection', { collectionName });
  try {
    await makeRequest({
      endpoint: '/collections/add-collection',
      body: { collection_name: collectionName },
      schema: SuccessMessageResponseSchema,
    });
    log.info('ZeroEntropy: collection created', { collectionName });
    return ok(undefined);
  } catch (error) {
    if (error instanceof ZeroEntropyError && error.statusCode === 409) {
      log.info('ZeroEntropy: collection already exists', { collectionName });
      return ok(undefined);
    }
    log.error('ZeroEntropy: createCollection failed', error, {
      collectionName,
    });
    return err(toAppError(error));
  }
}

async function deleteCollection(
  collectionName: string,
): Promise<Result<void, AppError>> {
  try {
    await makeRequest({
      endpoint: '/collections/delete-collection',
      body: { collection_name: collectionName },
      schema: SuccessMessageResponseSchema,
    });
    return ok(undefined);
  } catch (error) {
    log.error('ZeroEntropy: deleteCollection failed', error, {
      collectionName,
    });
    return err(toAppError(error));
  }
}

async function listCollections(): Promise<Result<string[], AppError>> {
  try {
    const res = await makeRequest({
      endpoint: '/collections/get-collection-list',
      body: {},
      schema: ListCollectionsResponseSchema,
    });
    return ok(res.collection_names);
  } catch (error) {
    log.error('ZeroEntropy: listCollections failed', error);
    return err(toAppError(error));
  }
}

async function collectionExists(
  collectionName: string,
): Promise<Result<boolean, AppError>> {
  const list = await listCollections();
  if (list.isErr()) return err(list.error);
  return ok(list.value.includes(collectionName));
}

async function addSingleDocument(args: {
  collectionName: string;
  document: EntityToIndex;
}): Promise<void> {
  try {
    await makeRequest({
      endpoint: '/documents/add-document',
      body: buildAddDocumentBody(args),
      schema: SuccessMessageResponseSchema,
    });
  } catch (error) {
    if (error instanceof ZeroEntropyError && error.statusCode === 409) {
      log.info('ZeroEntropy: document already exists, treating as success', {
        collectionName: args.collectionName,
        path: documentPath(args.document),
      });
      return;
    }
    throw error;
  }
}

async function addDocuments(args: {
  collectionName: string;
  documents: EntityToIndex[];
}): Promise<
  Result<{ failedDocuments: ZeroEntropyFailedDocument[] }, AppError>
> {
  if (args.documents.length === 0) return ok({ failedDocuments: [] });
  log.info('ZeroEntropy: adding documents', {
    collectionName: args.collectionName,
    count: args.documents.length,
  });

  const settled = await Promise.allSettled(
    args.documents.map((doc) =>
      addSingleDocument({ collectionName: args.collectionName, document: doc }),
    ),
  );

  const failedDocuments: ZeroEntropyFailedDocument[] = [];
  for (let i = 0; i < settled.length; i += 1) {
    const r = settled[i];
    const doc = args.documents[i];
    if (!r || !doc) continue;
    if (r.status === 'rejected') {
      const reason = r.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      failedDocuments.push({ path: documentPath(doc), error: message });
    }
  }

  if (failedDocuments.length > 0) {
    log.error(
      'ZeroEntropy: addDocuments partial failure',
      new Error(failedDocuments[0]?.error ?? 'addDocuments failure'),
      {
        collectionName: args.collectionName,
        totalDocuments: args.documents.length,
        failedDocuments: failedDocuments.length,
      },
    );
  }

  return ok({ failedDocuments });
}

async function deleteDocument(args: {
  collectionName: string;
  path: string;
}): Promise<Result<{ deletedPaths: string[] }, AppError>> {
  try {
    const res = await makeRequest({
      endpoint: '/documents/delete-document',
      body: {
        collection_name: args.collectionName,
        path: args.path,
      },
      schema: DeleteDocumentResponseSchema,
    });
    return ok({ deletedPaths: res.deleted_paths });
  } catch (error) {
    if (
      error instanceof ZeroEntropyError &&
      error.code === ZeroEntropyErrorCode.DOCUMENT_NOT_FOUND
    ) {
      log.info('ZeroEntropy: document already absent, skipping', args);
      return ok({ deletedPaths: [] });
    }
    log.error('ZeroEntropy: deleteDocument failed', error, args);
    return err(toAppError(error));
  }
}

async function getStatus(
  collectionName: string,
): Promise<Result<ZeroEntropyCollectionStatus, AppError>> {
  try {
    const res = await makeRequest({
      endpoint: '/status/get-status',
      body: { collection_name: collectionName },
      schema: GetStatusResponseSchema,
    });
    return ok({
      numDocuments: res.num_documents,
      numParsing: res.num_parsing_documents,
      numIndexing: res.num_indexing_documents,
      numIndexed: res.num_indexed_documents,
      numFailed: res.num_failed_documents,
      numIndexedBytes: res.num_indexed_bytes,
    });
  } catch (error) {
    log.error('ZeroEntropy: getStatus failed', error, { collectionName });
    return err(toAppError(error));
  }
}

async function getDocuments(args: {
  collectionName: string;
  pathPrefix?: string;
}): Promise<Result<ZeroEntropyDocumentInfo[], AppError>> {
  try {
    const res = await makeRequest({
      endpoint: '/documents/get-document-info-list',
      body: {
        collection_name: args.collectionName,
        ...(args.pathPrefix ? { path_prefix: args.pathPrefix } : {}),
      },
      schema: GetDocumentInfoListResponseSchema,
    });
    return ok(res.documents.map(mapDocumentInfo));
  } catch (error) {
    log.error('ZeroEntropy: getDocuments failed', error, args);
    return err(toAppError(error));
  }
}

async function queryTopSnippets(args: {
  collectionName: string;
  query: string;
  k: number;
  filter?: ZeroEntropyQueryFilter;
  reranker?: ZeroEntropyRerankerModel | null;
  preciseResponses?: boolean;
}): Promise<Result<ZeroEntropySnippet[], AppError>> {
  const reranker =
    args.reranker === undefined
      ? ZEROENTROPY_CONFIG.retrieval.defaultReranker
      : args.reranker;
  const preciseResponses =
    args.preciseResponses ??
    ZEROENTROPY_CONFIG.retrieval.defaultPreciseResponses;
  try {
    const res = await makeRequest({
      endpoint: '/queries/top-snippets',
      body: {
        collection_name: args.collectionName,
        query: args.query,
        k: args.k,
        include_document_metadata: true,
        precise_responses: preciseResponses,
        ...(reranker ? { reranker } : {}),
        ...(args.filter ? { filter: args.filter } : {}),
      },
      schema: TopSnippetsResponseSchema,
    });
    const docMetadata = new Map(
      (res.document_results ?? []).map((d) => [d.path, d.metadata ?? {}]),
    );
    return ok(
      res.results.map((s) => ({
        path: s.path,
        content: s.content,
        score: s.score,
        pageSpan: s.page_span,
        documentMetadata: docMetadata.get(s.path) ?? {},
      })),
    );
  } catch (error) {
    log.error('ZeroEntropy: queryTopSnippets failed', error, {
      collectionName: args.collectionName,
    });
    return err(toAppError(error));
  }
}

async function queryTopDocuments(args: {
  collectionName: string;
  query: string;
  k: number;
  filter?: ZeroEntropyQueryFilter;
}): Promise<Result<ZeroEntropyDocumentInfo[], AppError>> {
  try {
    const res = await makeRequest({
      endpoint: '/queries/top-documents',
      body: {
        collection_name: args.collectionName,
        query: args.query,
        k: args.k,
        include_metadata: true,
        ...(args.filter ? { filter: args.filter } : {}),
      },
      schema: TopDocumentsResponseSchema,
    });
    return ok(
      res.results.map((r) => ({
        path: r.path,
        metadata: r.metadata ?? {},
      })),
    );
  } catch (error) {
    log.error('ZeroEntropy: queryTopDocuments failed', error, {
      collectionName: args.collectionName,
    });
    return err(toAppError(error));
  }
}

export const zeroEntropyClient: IZeroEntropyClient = {
  createCollection,
  deleteCollection,
  listCollections,
  collectionExists,
  getStatus,
  addDocuments,
  deleteDocument,
  getDocuments,
  queryTopSnippets,
  queryTopDocuments,
};
