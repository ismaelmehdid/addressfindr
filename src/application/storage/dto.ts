import * as v from 'valibot';
import { FILE_CATEGORIES, type FileCategory } from '@/core/storage/types/file';
import {
  IMAGE_DIMENSION_MAX,
  IMAGE_DIMENSION_MIN,
  IMAGE_QUALITY_MAX,
  IMAGE_QUALITY_MIN,
} from '@/core/storage/types/image-transform';

export const MAX_INLINE_UPLOAD_BYTES = 6 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/json',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_SIGNED_URL_TTL_SECONDS = 3600;
export const MIN_SIGNED_URL_TTL_SECONDS = 1;
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

export const FileCategorySchema = v.picklist(FILE_CATEGORIES);

export const ImageTransformSchema = v.partial(
  v.object({
    width: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(IMAGE_DIMENSION_MIN),
      v.maxValue(IMAGE_DIMENSION_MAX),
    ),
    height: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(IMAGE_DIMENSION_MIN),
      v.maxValue(IMAGE_DIMENSION_MAX),
    ),
    quality: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(IMAGE_QUALITY_MIN),
      v.maxValue(IMAGE_QUALITY_MAX),
    ),
    resize: v.picklist(['cover', 'contain', 'fill']),
    format: v.picklist(['origin']),
  }),
);

export const MimeTypeSchema = v.picklist(ALLOWED_MIME_TYPES);

export const UploadFileInputSchema = v.object({
  category: FileCategorySchema,
  filename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  mimeType: MimeTypeSchema,
  sizeBytes: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(MAX_INLINE_UPLOAD_BYTES),
  ),
});

export const CreateSignedUploadUrlInputSchema = v.object({
  category: FileCategorySchema,
  filename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  mimeType: MimeTypeSchema,
});

export const CreateDownloadUrlInputSchema = v.object({
  path: v.pipe(v.string(), v.minLength(1)),
  ttlSeconds: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(MIN_SIGNED_URL_TTL_SECONDS),
    v.maxValue(MAX_SIGNED_URL_TTL_SECONDS),
  ),
  transform: v.optional(ImageTransformSchema),
  downloadAs: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(255))),
});

export const RemoveFilesInputSchema = v.object({
  paths: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1))),
    v.minLength(1),
    v.maxLength(100),
  ),
});

export const ListFilesInputSchema = v.object({
  category: FileCategorySchema,
  limit: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(MAX_LIST_LIMIT),
  ),
  offset: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const GetFileInputSchema = v.object({
  path: v.pipe(v.string(), v.minLength(1)),
});

export type UploadFileInput = v.InferOutput<typeof UploadFileInputSchema>;
export type CreateSignedUploadUrlInput = v.InferOutput<
  typeof CreateSignedUploadUrlInputSchema
>;
export type CreateDownloadUrlInput = v.InferOutput<
  typeof CreateDownloadUrlInputSchema
>;
export type RemoveFilesInput = v.InferOutput<typeof RemoveFilesInputSchema>;
export type ListFilesInput = v.InferOutput<typeof ListFilesInputSchema>;
export type GetFileInput = v.InferOutput<typeof GetFileInputSchema>;

export type StoredFileDto = {
  path: string;
  bucket: string;
  sizeBytes: number;
  mimeType: string;
  category: FileCategory;
  createdAt: string;
  updatedAt: string;
};

export type UploadedFileDto = {
  path: string;
  bucket: string;
};

export type SignedUploadCredentialsDto = {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
  resumableEndpoint: string;
  resumableChunkSizeBytes: number;
  resumableHeaderName: 'x-signature';
  expiresAt: string;
};

export type SignedUrlDto = {
  url: string;
  path: string;
  expiresAt: string;
};
