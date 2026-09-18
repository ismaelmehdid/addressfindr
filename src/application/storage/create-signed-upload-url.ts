import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { requireUserScope } from '@/application/me/user-scope';
import { type AppError, parseInput } from '@/core/errors';
import { buildFilePath } from '@/core/storage/services/file-path';
import { supabaseStorageAdapter } from '@/infra/external-apis/supabase-storage/storage-adapter';
import { env } from '@/shared/env';
import {
  type CreateSignedUploadUrlInput,
  CreateSignedUploadUrlInputSchema,
  type SignedUploadCredentialsDto,
} from './dto';

export async function createSignedUploadUrl(
  input: CreateSignedUploadUrlInput,
): Promise<Result<SignedUploadCredentialsDto, AppError>> {
  const parsed = parseInput(
    CreateSignedUploadUrlInputSchema,
    input,
    'Invalid signed upload input',
  );
  if (parsed.isErr()) return err(parsed.error);

  const scope = await requireUserScope();
  if (scope.isErr()) return err(scope.error);

  const path = buildFilePath({
    userId: scope.value.userId,
    category: parsed.value.category,
    filename: parsed.value.filename,
  });
  if (path.isErr()) return err(path.error);

  const bucket = env().SUPABASE_STORAGE_BUCKET;
  const result = await supabaseStorageAdapter.createSignedUploadCredentials({
    bucket,
    path: path.value,
    upsert: false,
  });
  if (result.isErr()) return err(result.error);

  return ok({
    bucket: result.value.bucket,
    path: result.value.path,
    token: result.value.token,
    signedUrl: result.value.signedUrl,
    resumableEndpoint: result.value.resumableEndpoint,
    resumableChunkSizeBytes: result.value.resumableChunkSizeBytes,
    resumableHeaderName: 'x-signature',
    expiresAt: result.value.expiresAt.toISOString(),
  });
}
