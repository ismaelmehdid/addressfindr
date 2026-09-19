import 'server-only';

import type { FileEntity } from '@/core/file/types';
import {
  DataSource,
  type EntityIndexMetadata,
  IndexableEntityType,
} from '@/core/zeroentropy/types';

export function buildFileMetadata(args: {
  file: FileEntity;
  docType: string;
  extra?: Record<string, string | number | boolean>;
}): EntityIndexMetadata {
  return {
    entityType: IndexableEntityType.FILE,
    entityId: args.file.id,
    userId: args.file.userId,
    updatedAt: args.file.updatedAt.toISOString(),
    docType: args.docType,
    source: DataSource.USER_UPLOAD,
    fileName: args.file.originalName,
    fileType: args.file.fileType,
    mimeType: args.file.mimeType,
    sizeBytes: args.file.sizeBytes,
    ...args.extra,
  };
}
