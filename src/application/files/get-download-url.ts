import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { requireOrganizationScope } from '@/application/me/organization-scope';
import type { AppError } from '@/core/errors';
import { getFileForUser } from '@/infra/data-access/file/file-repo';
import { supabaseStorageAdapter } from '@/infra/external-apis/supabase-storage/storage-adapter';
import { env } from '@/shared/env';

const DOWNLOAD_URL_TTL_SECONDS = 600;

export type DownloadUrlDto = {
  url: string;
  expiresAt: string;
};

export async function getFileDownloadUrl(
  fileId: string,
): Promise<Result<DownloadUrlDto, AppError>> {
  const scope = await requireOrganizationScope();
  if (scope.isErr()) return err(scope.error);

  const file = await getFileForUser({
    fileId,
    userId: scope.value.userId,
  });
  if (file.isErr()) return err(file.error);

  const bucket = env().SUPABASE_STORAGE_BUCKET;
  const signed = await supabaseStorageAdapter.createSignedDownloadUrl({
    bucket,
    path: file.value.storageKey,
    ttlSeconds: DOWNLOAD_URL_TTL_SECONDS,
    downloadAs: file.value.originalName,
  });
  if (signed.isErr()) return err(signed.error);

  return ok({
    url: signed.value.url,
    expiresAt: signed.value.expiresAt.toISOString(),
  });
}
