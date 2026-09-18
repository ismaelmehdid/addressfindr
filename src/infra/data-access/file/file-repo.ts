import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { type AppError, notFound, unknown } from '@/core/errors';
import {
  FILE_INDEX_STATUSES,
  FILE_STATUSES,
  FILE_TYPES,
  type FileEntity,
  type FileIndexStatus,
  FileStatus,
  type FileType,
} from '@/core/file/types';
import { parseFilePath } from '@/core/storage/services/file-path';
import { isMimeType, mimeType } from '@/core/storage/types/file';
import { db } from '@/infra/database/connection';
import { file } from '@/infra/database/schema/file-schema';
import { log } from '@/shared/logger';

type FileRow = typeof file.$inferSelect;
// Accepts both full rows and list projections that omit the heavy
// visionDescription text column (the list UI never reads it).
type FileRowForEntity = Pick<
  FileRow,
  | 'id'
  | 'userId'
  | 'originalName'
  | 'storageKey'
  | 'mimeType'
  | 'fileType'
  | 'sizeBytes'
  | 'status'
  | 'indexStatus'
  | 'createdAt'
  | 'updatedAt'
> & {
  visionDescription?: string | null;
};

const FileTypeSchema = v.picklist(FILE_TYPES);
const FileStatusSchema = v.picklist(FILE_STATUSES);
const FileIndexStatusSchema = v.picklist(FILE_INDEX_STATUSES);

function rowToEntity(row: FileRowForEntity): Result<FileEntity, AppError> {
  const storageKey = parseFilePath(row.storageKey);
  if (storageKey.isErr()) {
    return err(unknown(`Invalid file.storage_key in row ${row.id}`));
  }
  if (!isMimeType(row.mimeType)) {
    return err(unknown(`Invalid file.mime_type in row ${row.id}`));
  }
  const fileType = v.safeParse(FileTypeSchema, row.fileType);
  if (!fileType.success) {
    return err(unknown(`Invalid file.file_type in row ${row.id}`));
  }
  const status = v.safeParse(FileStatusSchema, row.status);
  if (!status.success) {
    return err(unknown(`Invalid file.status in row ${row.id}`));
  }
  const indexStatus = v.safeParse(FileIndexStatusSchema, row.indexStatus);
  if (!indexStatus.success) {
    return err(unknown(`Invalid file.index_status in row ${row.id}`));
  }
  return ok({
    id: row.id,
    userId: row.userId,
    originalName: row.originalName,
    storageKey: storageKey.value,
    mimeType: mimeType(row.mimeType),
    fileType: fileType.output,
    sizeBytes: row.sizeBytes,
    status: status.output,
    indexStatus: indexStatus.output,
    visionDescription: row.visionDescription ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

// All columns rowToEntity needs, minus the heavy visionDescription text.
const listColumns = {
  id: file.id,
  userId: file.userId,
  originalName: file.originalName,
  storageKey: file.storageKey,
  mimeType: file.mimeType,
  fileType: file.fileType,
  sizeBytes: file.sizeBytes,
  status: file.status,
  indexStatus: file.indexStatus,
  createdAt: file.createdAt,
  updatedAt: file.updatedAt,
} as const;

export async function setFileVisionDescription(args: {
  fileId: string;
  userId: string;
  visionDescription: string | null;
}): Promise<Result<void, AppError>> {
  try {
    await db
      .update(file)
      .set({ visionDescription: args.visionDescription })
      .where(and(eq(file.id, args.fileId), eq(file.userId, args.userId)));
    return ok(undefined);
  } catch (e) {
    log.error('Failed to set file vision description', e, {
      fileId: args.fileId,
    });
    return err(unknown('Failed to set file vision description'));
  }
}

export async function createFile(args: {
  userId: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  fileType: FileType;
  sizeBytes: number;
}): Promise<Result<FileEntity, AppError>> {
  try {
    const [row] = await db
      .insert(file)
      .values({
        userId: args.userId,
        originalName: args.originalName,
        storageKey: args.storageKey,
        mimeType: args.mimeType,
        fileType: args.fileType,
        sizeBytes: args.sizeBytes,
        status: FileStatus.UPLOADING,
        indexStatus: 'pending',
      })
      .returning();
    if (!row) return err(unknown('Failed to insert file row'));
    return rowToEntity(row);
  } catch (e) {
    log.error('Failed to create file row', e, { storageKey: args.storageKey });
    return err(unknown('Failed to create file row'));
  }
}

export async function getFileForUser(args: {
  fileId: string;
  userId: string;
}): Promise<Result<FileEntity, AppError>> {
  try {
    const [row] = await db
      .select()
      .from(file)
      .where(and(eq(file.id, args.fileId), eq(file.userId, args.userId)))
      .limit(1);
    if (!row) return err(notFound('File not found', 'file'));
    return rowToEntity(row);
  } catch (e) {
    log.error('Failed to fetch file', e, { fileId: args.fileId });
    return err(unknown('Failed to fetch file'));
  }
}

export async function getFilesByIds(args: {
  ids: string[];
  userId: string;
}): Promise<Result<FileEntity[], AppError>> {
  if (args.ids.length === 0) return ok([]);
  try {
    const rows = await db
      .select()
      .from(file)
      .where(and(inArray(file.id, args.ids), eq(file.userId, args.userId)));
    const items: FileEntity[] = [];
    for (const row of rows) {
      const mapped = rowToEntity(row);
      if (mapped.isErr()) return err(mapped.error);
      items.push(mapped.value);
    }
    return ok(items);
  } catch (e) {
    log.error('Failed to fetch files by ids', e, { count: args.ids.length });
    return err(unknown('Failed to fetch files by ids'));
  }
}

export type FilePage = {
  items: FileEntity[];
  hasMore: boolean;
  page: number;
};

export async function listFilesForUser(args: {
  userId: string;
  page: number;
  perPage: number;
}): Promise<Result<FilePage, AppError>> {
  try {
    const rows = await db
      .select(listColumns)
      .from(file)
      .where(
        and(eq(file.userId, args.userId), eq(file.status, FileStatus.UPLOADED)),
      )
      .orderBy(desc(file.createdAt))
      .limit(args.perPage + 1)
      .offset(args.page * args.perPage);
    const hasMore = rows.length > args.perPage;
    const items: FileEntity[] = [];
    for (const row of hasMore ? rows.slice(0, args.perPage) : rows) {
      const mapped = rowToEntity(row);
      if (mapped.isErr()) return err(mapped.error);
      items.push(mapped.value);
    }
    return ok({ items, hasMore, page: args.page });
  } catch (e) {
    log.error('Failed to list files', e, { userId: args.userId });
    return err(unknown('Failed to list files'));
  }
}

export async function markUploaded(args: {
  fileId: string;
  userId: string;
}): Promise<Result<FileEntity, AppError>> {
  try {
    const [row] = await db
      .update(file)
      .set({ status: FileStatus.UPLOADED })
      .where(and(eq(file.id, args.fileId), eq(file.userId, args.userId)))
      .returning();
    if (!row) return err(notFound('File not found', 'file'));
    return rowToEntity(row);
  } catch (e) {
    log.error('Failed to mark file uploaded', e, { fileId: args.fileId });
    return err(unknown('Failed to mark file uploaded'));
  }
}

export async function markIndexStatus(args: {
  fileId: string;
  userId: string;
  indexStatus: FileIndexStatus;
  indexError?: string | null;
}): Promise<Result<void, AppError>> {
  try {
    await db
      .update(file)
      .set({
        indexStatus: args.indexStatus,
        indexError: args.indexError ?? null,
      })
      .where(and(eq(file.id, args.fileId), eq(file.userId, args.userId)));
    return ok(undefined);
  } catch (e) {
    log.error('Failed to update file index status', e, args);
    return err(unknown('Failed to update file index status'));
  }
}

export async function deleteFileRow(args: {
  fileId: string;
  userId: string;
}): Promise<Result<void, AppError>> {
  try {
    await db
      .delete(file)
      .where(and(eq(file.id, args.fileId), eq(file.userId, args.userId)));
    return ok(undefined);
  } catch (e) {
    log.error('Failed to delete file row', e, { fileId: args.fileId });
    return err(unknown('Failed to delete file row'));
  }
}

export async function renameFileForUser(args: {
  fileId: string;
  userId: string;
  originalName: string;
}): Promise<Result<FileEntity, AppError>> {
  try {
    const [row] = await db
      .update(file)
      .set({ originalName: args.originalName })
      .where(and(eq(file.id, args.fileId), eq(file.userId, args.userId)))
      .returning();
    if (!row) return err(notFound('File not found', 'file'));
    return rowToEntity(row);
  } catch (e) {
    log.error('Failed to rename file', e, { fileId: args.fileId });
    return err(unknown('Failed to rename file'));
  }
}
