import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { type AppError, externalApi, notFound } from '@/core/errors';
import type {
  CreateSignedDownloadUrlInput,
  CreateSignedUploadCredentialsInput,
  DownloadInput,
  GetPublicUrlInput,
  ListInput,
  RemoveInput,
  StatInput,
  StoragePort,
} from '@/core/storage/ports/storage.port';
import { parseFilePath } from '@/core/storage/services/file-path';
import {
  type FileObject,
  isMimeType,
  mimeType,
} from '@/core/storage/types/file';
import type { ImageTransform } from '@/core/storage/types/image-transform';
import {
  RESUMABLE_CHUNK_SIZE_BYTES,
  SIGNED_UPLOAD_URL_TTL_SECONDS,
  type SignedUploadCredentials,
  type SignedUrl,
} from '@/core/storage/types/signed-url';
import type { UploadedFile, UploadInput } from '@/core/storage/types/upload';
import { log } from '@/shared/logger';
import { supabaseResumableEndpoint, supabaseStorageClient } from './client';
import {
  SupabaseSignedUploadUrlSchema,
  SupabaseSignedUrlSchema,
  SupabaseStorageObjectSchema,
  SupabaseUploadResultSchema,
} from './schemas';

const PROVIDER = 'supabase-storage';

function mapSupabaseError(message: string): AppError {
  const lower = message.toLowerCase();
  if (lower.includes('not found') || lower.includes('object not found')) {
    return notFound(message, 'file');
  }
  return externalApi(PROVIDER, message);
}

function mapStorageObject(input: {
  raw: unknown;
  bucket: FileObject['bucket'];
  parentPrefix: string;
}): Result<FileObject, AppError> {
  const parsed = v.safeParse(SupabaseStorageObjectSchema, input.raw);
  if (!parsed.success) {
    return err(externalApi(PROVIDER, 'Unexpected storage object shape'));
  }
  const obj = parsed.output;
  if (!obj.metadata) {
    return err(externalApi(PROVIDER, 'Storage object missing metadata'));
  }
  const rawPath =
    input.parentPrefix.length > 0
      ? `${input.parentPrefix}/${obj.name}`
      : obj.name;
  const path = parseFilePath(rawPath);
  if (path.isErr()) {
    return err(externalApi(PROVIDER, 'Storage object has invalid path'));
  }
  if (!isMimeType(obj.metadata.mimetype)) {
    return err(externalApi(PROVIDER, 'Storage object has invalid MIME type'));
  }
  return ok({
    bucket: input.bucket,
    path: path.value,
    sizeBytes: obj.metadata.size,
    mimeType: mimeType(obj.metadata.mimetype),
    createdAt: new Date(obj.created_at),
    updatedAt: new Date(obj.updated_at),
  });
}

function transformToSdk(transform?: ImageTransform):
  | {
      width?: number;
      height?: number;
      quality?: number;
      resize?: ImageTransform['resize'];
      format?: ImageTransform['format'];
    }
  | undefined {
  if (!transform) return undefined;
  return {
    width: transform.width,
    height: transform.height,
    quality: transform.quality,
    resize: transform.resize,
    format: transform.format,
  };
}

async function upload(
  input: UploadInput,
): Promise<Result<UploadedFile, AppError>> {
  log.info('storage.upload start', {
    bucket: input.bucket,
    path: input.path,
  });
  try {
    const { data, error } = await supabaseStorageClient()
      .storage.from(input.bucket)
      .upload(input.path, input.body as Blob | ArrayBuffer | Uint8Array, {
        contentType: input.mimeType,
        cacheControl: input.cacheControl ?? '3600',
        upsert: input.upsert ?? false,
      });

    if (error) {
      log.error('storage.upload failure', error, {
        bucket: input.bucket,
        path: input.path,
      });
      return err(mapSupabaseError(error.message));
    }

    const parsed = v.safeParse(SupabaseUploadResultSchema, data);
    if (!parsed.success) {
      return err(externalApi(PROVIDER, 'Unexpected upload response shape'));
    }

    const path = parseFilePath(parsed.output.path);
    if (path.isErr()) {
      return err(externalApi(PROVIDER, 'Upload returned invalid path'));
    }
    log.info('storage.upload success', {
      bucket: input.bucket,
      path: path.value,
    });
    return ok({
      bucket: input.bucket,
      path: path.value,
    });
  } catch (e) {
    log.error('storage.upload exception', e, {
      bucket: input.bucket,
      path: input.path,
    });
    return err(externalApi(PROVIDER, 'Upload failed'));
  }
}

async function createSignedUploadCredentials(
  input: CreateSignedUploadCredentialsInput,
): Promise<Result<SignedUploadCredentials, AppError>> {
  log.info('storage.createSignedUploadCredentials start', {
    bucket: input.bucket,
    path: input.path,
  });
  try {
    const { data, error } = await supabaseStorageClient()
      .storage.from(input.bucket)
      .createSignedUploadUrl(input.path, { upsert: input.upsert ?? false });

    if (error) {
      log.error('storage.createSignedUploadCredentials failure', error, {
        bucket: input.bucket,
        path: input.path,
      });
      return err(mapSupabaseError(error.message));
    }

    const parsed = v.safeParse(SupabaseSignedUploadUrlSchema, data);
    if (!parsed.success) {
      return err(
        externalApi(PROVIDER, 'Unexpected signed upload URL response shape'),
      );
    }

    const path = parseFilePath(parsed.output.path);
    if (path.isErr()) {
      return err(
        externalApi(PROVIDER, 'Signed upload URL returned invalid path'),
      );
    }
    const expiresAt = new Date(
      Date.now() + SIGNED_UPLOAD_URL_TTL_SECONDS * 1000,
    );
    log.info('storage.createSignedUploadCredentials success', {
      bucket: input.bucket,
      path: path.value,
    });
    return ok({
      bucket: input.bucket,
      path: path.value,
      signedUrl: parsed.output.signedUrl,
      token: parsed.output.token,
      resumableEndpoint: supabaseResumableEndpoint(),
      resumableChunkSizeBytes: RESUMABLE_CHUNK_SIZE_BYTES,
      expiresAt,
    });
  } catch (e) {
    log.error('storage.createSignedUploadCredentials exception', e, {
      bucket: input.bucket,
      path: input.path,
    });
    return err(externalApi(PROVIDER, 'Failed to create signed upload URL'));
  }
}

async function createSignedDownloadUrl(
  input: CreateSignedDownloadUrlInput,
): Promise<Result<SignedUrl, AppError>> {
  log.info('storage.createSignedDownloadUrl start', {
    bucket: input.bucket,
    path: input.path,
    ttlSeconds: input.ttlSeconds,
  });
  try {
    const options: {
      transform?: ReturnType<typeof transformToSdk>;
      download?: string | boolean;
    } = {};
    const transform = transformToSdk(input.transform);
    if (transform) options.transform = transform;
    if (input.downloadAs !== undefined) options.download = input.downloadAs;

    const { data, error } = await supabaseStorageClient()
      .storage.from(input.bucket)
      .createSignedUrl(input.path, input.ttlSeconds, options);

    if (error) {
      log.error('storage.createSignedDownloadUrl failure', error, {
        bucket: input.bucket,
        path: input.path,
      });
      return err(mapSupabaseError(error.message));
    }

    const parsed = v.safeParse(SupabaseSignedUrlSchema, data);
    if (!parsed.success) {
      return err(externalApi(PROVIDER, 'Unexpected signed URL response shape'));
    }

    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
    log.info('storage.createSignedDownloadUrl success', {
      bucket: input.bucket,
      path: input.path,
    });
    return ok({
      url: parsed.output.signedUrl,
      path: input.path,
      expiresAt,
    });
  } catch (e) {
    log.error('storage.createSignedDownloadUrl exception', e, {
      bucket: input.bucket,
      path: input.path,
    });
    return err(externalApi(PROVIDER, 'Failed to create signed URL'));
  }
}

function getPublicUrl(input: GetPublicUrlInput): Result<string, AppError> {
  try {
    const options: { transform?: ReturnType<typeof transformToSdk> } = {};
    const transform = transformToSdk(input.transform);
    if (transform) options.transform = transform;

    const { data } = supabaseStorageClient()
      .storage.from(input.bucket)
      .getPublicUrl(input.path, options);

    if (!data?.publicUrl) {
      return err(externalApi(PROVIDER, 'Public URL response missing url'));
    }
    return ok(data.publicUrl);
  } catch (e) {
    log.error('storage.getPublicUrl exception', e, {
      bucket: input.bucket,
      path: input.path,
    });
    return err(externalApi(PROVIDER, 'Failed to compute public URL'));
  }
}

async function download(input: DownloadInput): Promise<Result<Blob, AppError>> {
  log.info('storage.download start', {
    bucket: input.bucket,
    path: input.path,
  });
  try {
    const options: { transform?: ReturnType<typeof transformToSdk> } = {};
    const transform = transformToSdk(input.transform);
    if (transform) options.transform = transform;

    const { data, error } = await supabaseStorageClient()
      .storage.from(input.bucket)
      .download(input.path, options);

    if (error) {
      log.error('storage.download failure', error, {
        bucket: input.bucket,
        path: input.path,
      });
      return err(mapSupabaseError(error.message));
    }
    if (!data) {
      return err(notFound('File not found', 'file'));
    }
    log.info('storage.download success', {
      bucket: input.bucket,
      path: input.path,
      sizeBytes: data.size,
    });
    return ok(data);
  } catch (e) {
    log.error('storage.download exception', e, {
      bucket: input.bucket,
      path: input.path,
    });
    return err(externalApi(PROVIDER, 'Download failed'));
  }
}

async function remove(input: RemoveInput): Promise<Result<void, AppError>> {
  if (input.paths.length === 0) return ok(undefined);
  log.info('storage.remove start', {
    bucket: input.bucket,
    count: input.paths.length,
  });
  try {
    const { error } = await supabaseStorageClient()
      .storage.from(input.bucket)
      .remove(input.paths);

    if (error) {
      log.error('storage.remove failure', error, {
        bucket: input.bucket,
        count: input.paths.length,
      });
      return err(mapSupabaseError(error.message));
    }
    log.info('storage.remove success', {
      bucket: input.bucket,
      count: input.paths.length,
    });
    return ok(undefined);
  } catch (e) {
    log.error('storage.remove exception', e, {
      bucket: input.bucket,
      count: input.paths.length,
    });
    return err(externalApi(PROVIDER, 'Remove failed'));
  }
}

async function list(input: ListInput): Promise<Result<FileObject[], AppError>> {
  log.info('storage.list start', {
    bucket: input.bucket,
    prefix: input.prefix,
    limit: input.limit,
    offset: input.offset,
  });
  try {
    const { data, error } = await supabaseStorageClient()
      .storage.from(input.bucket)
      .list(input.prefix, {
        limit: input.limit,
        offset: input.offset,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      log.error('storage.list failure', error, {
        bucket: input.bucket,
        prefix: input.prefix,
      });
      return err(mapSupabaseError(error.message));
    }
    if (!data) return ok([]);

    const results: FileObject[] = [];
    for (const raw of data) {
      if (raw.id === null) continue;
      const mapped = mapStorageObject({
        raw,
        bucket: input.bucket,
        parentPrefix: input.prefix,
      });
      if (mapped.isErr()) return err(mapped.error);
      results.push(mapped.value);
    }

    log.info('storage.list success', {
      bucket: input.bucket,
      prefix: input.prefix,
      count: results.length,
    });
    return ok(results);
  } catch (e) {
    log.error('storage.list exception', e, {
      bucket: input.bucket,
      prefix: input.prefix,
    });
    return err(externalApi(PROVIDER, 'List failed'));
  }
}

async function stat(input: StatInput): Promise<Result<FileObject, AppError>> {
  const lastSlash = input.path.lastIndexOf('/');
  const parent = lastSlash >= 0 ? input.path.slice(0, lastSlash) : '';
  const name = lastSlash >= 0 ? input.path.slice(lastSlash + 1) : input.path;

  log.info('storage.stat start', {
    bucket: input.bucket,
    path: input.path,
  });
  try {
    const { data, error } = await supabaseStorageClient()
      .storage.from(input.bucket)
      .list(parent, { search: name, limit: 1 });

    if (error) {
      log.error('storage.stat failure', error, {
        bucket: input.bucket,
        path: input.path,
      });
      return err(mapSupabaseError(error.message));
    }
    const match = data?.find((d) => d.name === name && d.id !== null);
    if (!match) return err(notFound('File not found', 'file'));

    return mapStorageObject({
      raw: match,
      bucket: input.bucket,
      parentPrefix: parent,
    });
  } catch (e) {
    log.error('storage.stat exception', e, {
      bucket: input.bucket,
      path: input.path,
    });
    return err(externalApi(PROVIDER, 'Stat failed'));
  }
}

export const supabaseStorageAdapter: StoragePort = {
  upload,
  createSignedUploadCredentials,
  createSignedDownloadUrl,
  getPublicUrl,
  download,
  remove,
  list,
  stat,
};
