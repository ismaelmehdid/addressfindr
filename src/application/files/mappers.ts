import type { FileEntity } from '@/core/file/types';
import type { FileDto } from './dto';

export function toFileDto(entity: FileEntity): FileDto {
  return {
    id: entity.id,
    originalName: entity.originalName,
    mimeType: entity.mimeType,
    fileType: entity.fileType,
    sizeBytes: entity.sizeBytes,
    status: entity.status,
    indexStatus: entity.indexStatus,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
