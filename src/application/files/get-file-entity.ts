import 'server-only';

import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { FileEntity } from '@/core/file/types';
import {
  getFileForUser,
  getFilesByIds,
} from '@/infra/data-access/file/file-repo';

export async function getFileEntityForUser(args: {
  fileId: string;
  userId: string;
}): Promise<Result<FileEntity, AppError>> {
  return getFileForUser(args);
}

export async function getFileEntitiesByIds(args: {
  ids: string[];
  userId: string;
}): Promise<Result<FileEntity[], AppError>> {
  return getFilesByIds(args);
}
