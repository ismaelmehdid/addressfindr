import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { v7 as uuidv7 } from 'uuid';
import { requireOrganizationScope } from '@/application/me/organization-scope';
import { dispatchEvent } from '@/application/zeroentropy/entity-sync-orchestrator';
import type { AppError } from '@/core/errors';
import {
  DataSource,
  IndexableEntityType,
  SyncOperation,
} from '@/core/zeroentropy/types';
import {
  deleteFileRow,
  getFileForOrg,
} from '@/infra/data-access/file/file-repo';
import { supabaseStorageAdapter } from '@/infra/external-apis/supabase-storage/storage-adapter';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

export async function deleteFile(
  fileId: string,
): Promise<Result<void, AppError>> {
  const scope = await requireOrganizationScope();
  if (scope.isErr()) return err(scope.error);

  const file = await getFileForOrg({
    fileId,
    organizationId: scope.value.organizationId,
  });
  if (file.isErr()) return err(file.error);

  const indexDelete = await dispatchEvent({
    eventId: uuidv7(),
    operation: SyncOperation.DELETE,
    entityType: IndexableEntityType.FILE,
    entityId: fileId,
    organizationId: scope.value.organizationId,
    source: DataSource.USER_UPLOAD,
    timestamp: new Date(),
  });
  if (indexDelete.isErr()) {
    log.warn('file.delete.ze_failed', {
      fileId,
      error: indexDelete.error.message,
    });
    return err(indexDelete.error);
  }

  const bucket = env().SUPABASE_STORAGE_BUCKET;
  const storageKey = file.value.storageKey;
  const storageDelete = await supabaseStorageAdapter.remove({
    bucket,
    paths: [storageKey],
  });
  if (storageDelete.isErr()) {
    log.warn('file.delete.storage_failed_after_ze_cleared', {
      fileId,
      storageKey,
      error: storageDelete.error.message,
    });
    return err(storageDelete.error);
  }

  const dbDelete = await deleteFileRow({
    fileId,
    organizationId: scope.value.organizationId,
  });
  if (dbDelete.isErr()) {
    log.error(
      'file.delete.db_failed_after_ze_and_storage_cleared',
      new Error(dbDelete.error.message),
      { fileId, storageKey },
    );
    return err(dbDelete.error);
  }

  return ok(undefined);
}
