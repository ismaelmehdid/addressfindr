import * as v from 'valibot';
import { MimeTypeSchema } from '@/application/storage/dto';
import { MAX_FILE_SIZE_BYTES } from '@/core/file/mime-mapping';

export const InitiateFileUploadInputSchema = v.object({
  originalName: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  mimeType: MimeTypeSchema,
  sizeBytes: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(MAX_FILE_SIZE_BYTES, 'File exceeds maximum size'),
  ),
});

export type InitiateFileUploadInput = v.InferOutput<
  typeof InitiateFileUploadInputSchema
>;

export const FinalizeFileUploadInputSchema = v.object({
  fileId: v.pipe(v.string(), v.minLength(1)),
});

export type FinalizeFileUploadInput = v.InferOutput<
  typeof FinalizeFileUploadInputSchema
>;

export const FILES_PAGE_SIZE = 24;

export const ListFilesInputSchema = v.object({
  page: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
  perPage: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
    FILES_PAGE_SIZE,
  ),
});

export type ListFilesInput = v.InferOutput<typeof ListFilesInputSchema>;

export const RenameFileInputSchema = v.object({
  fileId: v.pipe(v.string(), v.minLength(1)),
  originalName: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
});

export type RenameFileInput = v.InferOutput<typeof RenameFileInputSchema>;

export const BulkDownloadUrlsInputSchema = v.object({
  ids: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1))),
    v.minLength(1),
    v.maxLength(50),
  ),
});

export type BulkDownloadUrlsInput = v.InferOutput<
  typeof BulkDownloadUrlsInputSchema
>;

export type BulkDownloadUrlsDto = {
  urls: Record<string, { url: string; expiresAt: string }>;
  missingIds: string[];
};

export type FileDto = {
  id: string;
  originalName: string;
  mimeType: string;
  fileType: string;
  sizeBytes: number;
  status: string;
  indexStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type FinalizeFileUploadResult = {
  file: FileDto;
  signedUrl: string;
  signedUrlExpiresAt: string;
};

export type InitiatedUploadDto = {
  fileId: string;
  bucket: string;
  storageKey: string;
  signedUrl: string;
  token: string;
  resumableEndpoint: string;
  resumableChunkSizeBytes: number;
  resumableHeaderName: 'x-signature';
  expiresAt: string;
};
