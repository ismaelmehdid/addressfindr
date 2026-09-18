import 'server-only';

import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { FileEntity } from '@/core/file/types';
import {
  getFileForOrg,
  getFilesByIds,
} from '@/infra/data-access/file/file-repo';

export async function getFileEntityForOrg(args: {
  fileId: string;
  organizationId: string;
}): Promise<Result<FileEntity, AppError>> {
  return getFileForOrg(args);
}

export async function getFileEntitiesByIds(
  ids: string[],
): Promise<Result<FileEntity[], AppError>> {
  return getFilesByIds(ids);
}
