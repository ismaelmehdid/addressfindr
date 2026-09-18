import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { type AppError, unknown } from '@/core/errors';
import type { FileEntity } from '@/core/file/types';
import { supabaseStorageAdapter } from '@/infra/external-apis/supabase-storage/storage-adapter';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

export async function downloadFileBuffer(
  file: FileEntity,
): Promise<Result<Buffer, AppError>> {
  const bucket = env().SUPABASE_STORAGE_BUCKET;
  const dl = await supabaseStorageAdapter.download({
    bucket,
    path: file.storageKey,
  });
  if (dl.isErr()) return err(dl.error);
  try {
    const arrayBuffer = await dl.value.arrayBuffer();
    return ok(Buffer.from(arrayBuffer));
  } catch (e) {
    log.error('Failed to read downloaded file buffer', e, { fileId: file.id });
    return err(unknown('Failed to read downloaded file buffer'));
  }
}
