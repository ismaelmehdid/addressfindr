import * as v from 'valibot';

export const SupabaseStorageObjectSchema = v.object({
  name: v.string(),
  id: v.optional(v.nullable(v.string())),
  bucket_id: v.optional(v.nullable(v.string())),
  created_at: v.pipe(v.string(), v.isoTimestamp()),
  updated_at: v.pipe(v.string(), v.isoTimestamp()),
  metadata: v.nullable(
    v.object({
      size: v.number(),
      mimetype: v.string(),
    }),
  ),
});

export type SupabaseStorageObject = v.InferOutput<
  typeof SupabaseStorageObjectSchema
>;

export const SupabaseSignedUploadUrlSchema = v.object({
  signedUrl: v.string(),
  token: v.string(),
  path: v.string(),
});

export const SupabaseSignedUrlSchema = v.object({
  signedUrl: v.string(),
});

export const SupabaseUploadResultSchema = v.object({
  path: v.string(),
});
