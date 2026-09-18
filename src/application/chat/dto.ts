import * as v from 'valibot';
import { MimeTypeSchema } from '@/application/storage/dto';

export const CHAT_PROVIDER_METADATA_KEY = 'app';

export const ChatFileProviderMetadataSchema = v.object({
  fileId: v.pipe(v.string(), v.minLength(1)),
});

export type ChatFileProviderMetadata = v.InferOutput<
  typeof ChatFileProviderMetadataSchema
>;

export const ChatFileUIPartSchema = v.object({
  type: v.literal('file'),
  mediaType: MimeTypeSchema,
  url: v.pipe(v.string(), v.minLength(1)),
  filename: v.optional(v.string()),
  providerMetadata: v.object({
    [CHAT_PROVIDER_METADATA_KEY]: ChatFileProviderMetadataSchema,
  }),
});

export type ChatFileUIPart = v.InferOutput<typeof ChatFileUIPartSchema>;
