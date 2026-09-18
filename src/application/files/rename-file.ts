import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { v7 as uuidv7 } from 'uuid';
import { requireOrganizationScope } from '@/application/me/organization-scope';
import { dispatchEvent } from '@/application/zeroentropy/entity-sync-orchestrator';
import { type AppError, parseInput } from '@/core/errors';
import {
  DataSource,
  IndexableEntityType,
  SyncOperation,
} from '@/core/zeroentropy/types';
import { renameFileForUser } from '@/infra/data-access/file/file-repo';
import { log } from '@/shared/logger';
import {
  type FileDto,
  type RenameFileInput,
  RenameFileInputSchema,
} from './dto';
import { toFileDto } from './mappers';

export async function renameFile(
  input: RenameFileInput,
): Promise<Result<FileDto, AppError>> {
  const parsed = parseInput(
    RenameFileInputSchema,
    input,
    'Invalid rename input',
  );
  if (parsed.isErr()) return err(parsed.error);

  const scope = await requireOrganizationScope();
  if (scope.isErr()) return err(scope.error);

  const renamed = await renameFileForUser({
    fileId: parsed.value.fileId,
    userId: scope.value.userId,
    originalName: parsed.value.originalName.trim(),
  });
  if (renamed.isErr()) return err(renamed.error);

  const indexEvent = await dispatchEvent({
    eventId: uuidv7(),
    operation: SyncOperation.UPDATE,
    entityType: IndexableEntityType.FILE,
    entityId: renamed.value.id,
    userId: scope.value.userId,
    source: DataSource.USER_EDIT,
    timestamp: new Date(),
  });
  if (indexEvent.isErr()) {
    log.warn('files.rename.sync_failed', {
      fileId: renamed.value.id,
      code: indexEvent.error.code,
    });
  }

  return ok(toFileDto(renamed.value));
}
