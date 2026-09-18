import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { requireOrganizationScope } from '@/application/me/organization-scope';
import type { AppError } from '@/core/errors';
import { getFileForOrg } from '@/infra/data-access/file/file-repo';
import { log } from '@/shared/logger';
import type { FileDto } from './dto';
import { toFileDto } from './mappers';

export async function getFile(
  fileId: string,
): Promise<Result<FileDto, AppError>> {
  const scope = await requireOrganizationScope();
  if (scope.isErr()) return err(scope.error);

  const file = await getFileForOrg({
    fileId,
    organizationId: scope.value.organizationId,
  });
  if (file.isErr()) {
    log.warn('files.get.failed', { fileId, reason: file.error.code });
    return err(file.error);
  }

  return ok(toFileDto(file.value));
}
