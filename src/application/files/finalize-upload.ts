import 'server-only';

import { waitUntil } from '@vercel/functions';
import { err, ok, type Result } from 'neverthrow';
import { v7 as uuidv7 } from 'uuid';
import { requireOrganizationScope } from '@/application/me/organization-scope';
import { recordLlmCost } from '@/application/rate-limit/llm-cost-limiter';
import { dispatchEvent } from '@/application/zeroentropy/entity-sync-orchestrator';
import { type AppError, notFound, parseInput, validation } from '@/core/errors';
import { type FileEntity, FileStatus, FileType } from '@/core/file/types';
import { assertMimeMatchesBytes } from '@/core/storage/services/content-sniff';
import type { Bucket } from '@/core/storage/types/bucket';
import type { FilePath } from '@/core/storage/types/file';
import {
  DataSource,
  IndexableEntityType,
  SyncOperation,
} from '@/core/zeroentropy/types';
import {
  deleteFileRow,
  getFileForUser,
  markIndexStatus,
  markUploaded,
  setFileVisionDescription,
} from '@/infra/data-access/file/file-repo';
import { describeImage } from '@/infra/external-apis/openai/image-vision-describer';
import { supabaseStorageAdapter } from '@/infra/external-apis/supabase-storage/storage-adapter';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const IMAGE_FILE_TYPES: ReadonlySet<string> = new Set([
  FileType.PNG,
  FileType.JPEG,
  FileType.WEBP,
]);

import {
  type FinalizeFileUploadInput,
  FinalizeFileUploadInputSchema,
  type FinalizeFileUploadResult,
} from './dto';
import { toFileDto } from './mappers';

const SIGNED_URL_TTL_SECONDS = 600;

export async function finalizeFileUpload(
  input: FinalizeFileUploadInput,
): Promise<Result<FinalizeFileUploadResult, AppError>> {
  const parsed = parseInput(
    FinalizeFileUploadInputSchema,
    input,
    'Invalid finalize input',
  );
  if (parsed.isErr()) return err(parsed.error);

  const scope = await requireOrganizationScope();
  if (scope.isErr()) return err(scope.error);

  const file = await getFileForUser({
    fileId: parsed.value.fileId,
    userId: scope.value.userId,
  });
  if (file.isErr()) return err(file.error);

  const bucket = env().SUPABASE_STORAGE_BUCKET;

  // Idempotent retry: already finalized — return the success DTO without
  // re-validating, re-marking, or re-running the billable vision/index pass.
  if (file.value.status === FileStatus.UPLOADED) {
    const signed = await supabaseStorageAdapter.createSignedDownloadUrl({
      bucket,
      path: file.value.storageKey,
      ttlSeconds: SIGNED_URL_TTL_SECONDS,
      downloadAs: file.value.originalName,
    });
    if (signed.isErr()) return err(signed.error);
    return ok({
      file: toFileDto(file.value),
      signedUrl: signed.value.url,
      signedUrlExpiresAt: signed.value.expiresAt.toISOString(),
    });
  }

  const stat = await supabaseStorageAdapter.stat({
    bucket,
    path: file.value.storageKey,
  });
  if (stat.isErr()) {
    const removed = await deleteFileRow({
      fileId: file.value.id,
      userId: scope.value.userId,
    });
    if (removed.isErr()) {
      log.warn('files.finalize.orphan_cleanup_failed', {
        fileId: file.value.id,
        code: removed.error.code,
        message: removed.error.message,
      });
    }
    return err(notFound('Upload not found in storage', 'file'));
  }
  if (stat.value.sizeBytes !== file.value.sizeBytes) {
    await purgeUpload({
      bucket,
      path: file.value.storageKey,
      fileId: file.value.id,
    });
    return err(
      validation('Uploaded file size does not match initiated size', 'size'),
    );
  }

  const blob = await supabaseStorageAdapter.download({
    bucket,
    path: file.value.storageKey,
  });
  if (blob.isErr()) {
    return err(notFound('Upload not found in storage', 'file'));
  }
  const bytes = new Uint8Array(await blob.value.arrayBuffer());
  const sniff = await assertMimeMatchesBytes({
    bytes,
    expected: file.value.mimeType,
  });
  if (sniff.isErr()) {
    await purgeUpload({
      bucket,
      path: file.value.storageKey,
      fileId: file.value.id,
    });
    return err(sniff.error);
  }

  const updated = await markUploaded({
    fileId: file.value.id,
    userId: scope.value.userId,
  });
  if (updated.isErr()) return err(updated.error);

  waitUntil(
    describeAndIndexFile({
      file: updated.value,
      bytes,
      userId: scope.value.userId,
    }),
  );

  const signed = await supabaseStorageAdapter.createSignedDownloadUrl({
    bucket,
    path: updated.value.storageKey,
    ttlSeconds: SIGNED_URL_TTL_SECONDS,
    downloadAs: updated.value.originalName,
  });
  if (signed.isErr()) return err(signed.error);

  return ok({
    file: toFileDto(updated.value),
    signedUrl: signed.value.url,
    signedUrlExpiresAt: signed.value.expiresAt.toISOString(),
  });
}

async function describeAndIndexFile(args: {
  file: FileEntity;
  bytes: Uint8Array;
  userId: string;
}): Promise<void> {
  const { file, bytes, userId } = args;

  if (IMAGE_FILE_TYPES.has(file.fileType)) {
    const base64 = Buffer.from(bytes).toString('base64');
    const described = await describeImage({
      base64,
      mimeType: file.mimeType,
      fileId: file.id,
    });
    const visionDescription = described.isOk() ? described.value.markdown : '';
    if (described.isErr()) {
      log.warn('files.finalize.vision_failed_fallback', {
        fileId: file.id,
        code: described.error.code,
      });
    } else {
      await recordLlmCost({
        userId,
        model: described.value.model,
        inputTokens: described.value.inputTokens,
        outputTokens: described.value.outputTokens,
      });
    }
    const persisted = await setFileVisionDescription({
      fileId: file.id,
      userId,
      visionDescription:
        visionDescription.length > 0 ? visionDescription : null,
    });
    if (persisted.isErr()) {
      log.warn('files.finalize.vision_persist_failed', {
        fileId: file.id,
        code: persisted.error.code,
      });
    }
  }

  const indexEvent = await dispatchEvent({
    eventId: uuidv7(),
    operation: SyncOperation.CREATE,
    entityType: IndexableEntityType.FILE,
    entityId: file.id,
    userId,
    source: DataSource.USER_UPLOAD,
    timestamp: new Date(),
  });

  if (indexEvent.isErr()) {
    await markIndexStatus({
      fileId: file.id,
      userId,
      indexStatus: 'error',
      indexError: indexEvent.error.message,
    });
    log.warn('File indexing failed, will be retried by cron', {
      fileId: file.id,
      error: indexEvent.error,
    });
  } else {
    await markIndexStatus({
      fileId: file.id,
      userId,
      indexStatus: 'indexed',
      indexError: null,
    });
  }
}

async function purgeUpload(args: {
  bucket: Bucket;
  path: FilePath;
  fileId: string;
}): Promise<void> {
  const removed = await supabaseStorageAdapter.remove({
    bucket: args.bucket,
    paths: [args.path],
  });
  if (removed.isErr()) {
    log.warn('files.finalize.purge_failed', {
      fileId: args.fileId,
      code: removed.error.code,
      message: removed.error.message,
    });
  }
}
