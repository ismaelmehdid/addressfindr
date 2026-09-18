import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { requireUserScope } from '@/application/me/user-scope';
import { createSignedUploadUrl } from '@/application/storage/create-signed-upload-url';
import { type AppError, parseInput, validation } from '@/core/errors';
import { mimeToFileType } from '@/core/file/mime-mapping';
import { createFile } from '@/infra/data-access/file/file-repo';
import {
  type InitiatedUploadDto,
  type InitiateFileUploadInput,
  InitiateFileUploadInputSchema,
} from './dto';

export async function initiateFileUpload(
  input: InitiateFileUploadInput,
): Promise<Result<InitiatedUploadDto, AppError>> {
  const parsed = parseInput(
    InitiateFileUploadInputSchema,
    input,
    'Invalid upload input',
  );
  if (parsed.isErr()) return err(parsed.error);

  const fileType = mimeToFileType(parsed.value.mimeType);
  if (!fileType) {
    return err(validation('Unsupported mime type', 'mimeType'));
  }

  const scope = await requireUserScope();
  if (scope.isErr()) return err(scope.error);

  const signed = await createSignedUploadUrl({
    category: 'attachments',
    filename: parsed.value.originalName,
    mimeType: parsed.value.mimeType,
  });
  if (signed.isErr()) return err(signed.error);

  const created = await createFile({
    userId: scope.value.userId,
    originalName: parsed.value.originalName,
    storageKey: signed.value.path,
    mimeType: parsed.value.mimeType,
    fileType,
    sizeBytes: parsed.value.sizeBytes,
  });
  if (created.isErr()) return err(created.error);

  return ok({
    fileId: created.value.id,
    bucket: signed.value.bucket,
    storageKey: signed.value.path,
    signedUrl: signed.value.signedUrl,
    token: signed.value.token,
    resumableEndpoint: signed.value.resumableEndpoint,
    resumableChunkSizeBytes: signed.value.resumableChunkSizeBytes,
    resumableHeaderName: signed.value.resumableHeaderName,
    expiresAt: signed.value.expiresAt,
  });
}
