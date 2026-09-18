import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { requireOrganizationScope } from '@/application/me/organization-scope';
import { type AppError, parseInput } from '@/core/errors';
import { getFileForOrg } from '@/infra/data-access/file/file-repo';
import { supabaseStorageAdapter } from '@/infra/external-apis/supabase-storage/storage-adapter';
import { env } from '@/shared/env';
import {
  type BulkDownloadUrlsDto,
  type BulkDownloadUrlsInput,
  BulkDownloadUrlsInputSchema,
} from './dto';

const DOWNLOAD_URL_TTL_SECONDS = 600;

export async function getBulkDownloadUrls(
  input: BulkDownloadUrlsInput,
): Promise<Result<BulkDownloadUrlsDto, AppError>> {
  const parsed = parseInput(
    BulkDownloadUrlsInputSchema,
    input,
    'Invalid bulk download input',
  );
  if (parsed.isErr()) return err(parsed.error);

  const scope = await requireOrganizationScope();
  if (scope.isErr()) return err(scope.error);

  const bucket = env().SUPABASE_STORAGE_BUCKET;
  const urls: Record<string, { url: string; expiresAt: string }> = {};
  const missingIds: string[] = [];

  const results = await Promise.all(
    parsed.value.ids.map(async (fileId) => {
      const file = await getFileForOrg({
        fileId,
        organizationId: scope.value.organizationId,
      });
      if (file.isErr()) return { id: fileId, ok: false as const };
      const signed = await supabaseStorageAdapter.createSignedDownloadUrl({
        bucket,
        path: file.value.storageKey,
        ttlSeconds: DOWNLOAD_URL_TTL_SECONDS,
      });
      if (signed.isErr()) return { id: fileId, ok: false as const };
      return {
        id: fileId,
        ok: true as const,
        url: signed.value.url,
        expiresAt: signed.value.expiresAt.toISOString(),
      };
    }),
  );

  for (const result of results) {
    if (result.ok) {
      urls[result.id] = { url: result.url, expiresAt: result.expiresAt };
    } else {
      missingIds.push(result.id);
    }
  }

  return ok({ urls, missingIds });
}
