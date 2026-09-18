import * as v from 'valibot';

const ZeroEntropyValidationErrorSchema = v.object({
  loc: v.array(v.string()),
  msg: v.string(),
  type: v.string(),
});

export const ZeroEntropyErrorResponseSchema = v.object({
  detail: v.union([v.string(), v.array(ZeroEntropyValidationErrorSchema)]),
});

export type ZeroEntropyErrorResponse = v.InferOutput<
  typeof ZeroEntropyErrorResponseSchema
>;

export const SuccessMessageResponseSchema = v.object({
  message: v.string(),
});

export const ListCollectionsResponseSchema = v.object({
  collection_names: v.array(v.string()),
});

export type ListCollectionsResponse = v.InferOutput<
  typeof ListCollectionsResponseSchema
>;

const DocumentIndexStatusSchema = v.picklist([
  'not_parsed',
  'parsing',
  'not_indexed',
  'indexing',
  'indexed',
  'parsing_failed',
  'indexing_failed',
]);

const MetadataValueSchema = v.union([v.string(), v.array(v.string())]);

const DocumentInfoSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  collection_name: v.string(),
  path: v.string(),
  metadata: v.record(v.string(), MetadataValueSchema),
  index_status: DocumentIndexStatusSchema,
  created_at: v.optional(v.string()),
  size: v.number(),
  num_pages: v.nullable(v.number()),
  file_url: v.string(),
  content: v.optional(v.nullable(v.string())),
});

export type DocumentInfo = v.InferOutput<typeof DocumentInfoSchema>;

const DocumentInfoListItemSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  collection_name: v.string(),
  path: v.string(),
  metadata: v.record(v.string(), MetadataValueSchema),
  index_status: DocumentIndexStatusSchema,
  created_at: v.optional(v.string()),
  size: v.number(),
  num_pages: v.nullable(v.number()),
  file_url: v.string(),
});

export const GetDocumentInfoResponseSchema = v.object({
  document: DocumentInfoSchema,
});

export const GetDocumentInfoListResponseSchema = v.object({
  documents: v.array(DocumentInfoListItemSchema),
});

export type GetDocumentInfoListResponse = v.InferOutput<
  typeof GetDocumentInfoListResponseSchema
>;

export const DeleteDocumentResponseSchema = v.object({
  deleted_paths: v.array(v.string()),
});

export const GetStatusResponseSchema = v.object({
  num_documents: v.number(),
  num_parsing_documents: v.number(),
  num_indexing_documents: v.number(),
  num_indexed_documents: v.number(),
  num_failed_documents: v.number(),
  num_indexed_bytes: v.number(),
});

const TopDocumentResultSchema = v.object({
  path: v.string(),
  score: v.number(),
  metadata: v.optional(v.record(v.string(), MetadataValueSchema)),
  file_url: v.optional(v.string()),
});

export const TopDocumentsResponseSchema = v.object({
  results: v.array(TopDocumentResultSchema),
});

export type TopDocumentsResponse = v.InferOutput<
  typeof TopDocumentsResponseSchema
>;

const TopSnippetResultSchema = v.object({
  path: v.string(),
  start_index: v.number(),
  end_index: v.number(),
  page_span: v.tuple([v.number(), v.number()]),
  content: v.string(),
  score: v.number(),
});

export const TopSnippetsResponseSchema = v.object({
  results: v.array(TopSnippetResultSchema),
  document_results: v.optional(v.array(TopDocumentResultSchema)),
});

export type TopSnippetsResponse = v.InferOutput<
  typeof TopSnippetsResponseSchema
>;
