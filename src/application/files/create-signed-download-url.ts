import 'server-only';

import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { FilePath } from '@/core/storage/types/file';
import type { SignedUrl } from '@/core/storage/types/signed-url';
import { supabaseStorageAdapter } from '@/infra/external-apis/supabase-storage/storage-adapter';
import { env } from '@/shared/env';

export async function createSignedDownloadUrlForFile(args: {
  storageKey: FilePath;
  ttlSeconds: number;
  downloadAs?: string;
}): Promise<Result<SignedUrl, AppError>> {
  const bucket = env().SUPABASE_STORAGE_BUCKET;
  return supabaseStorageAdapter.createSignedDownloadUrl({
    bucket,
    path: args.storageKey,
    ttlSeconds: args.ttlSeconds,
    ...(args.downloadAs !== undefined ? { downloadAs: args.downloadAs } : {}),
  });
}
