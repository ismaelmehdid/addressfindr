import type { FileEntity } from '@/core/file/types';
import { FileType } from '@/core/file/types';

export function fakeFile(overrides: Partial<FileEntity> = {}): FileEntity {
  return {
    id: 'file-1',
    userId: 'user-1',
    originalName: 'doc.pdf',
    storageKey: 'attachments/2024/file-1.pdf' as never,
    mimeType: 'application/pdf' as never,
    fileType: FileType.PDF,
    sizeBytes: 1234,
    status: 'uploaded' as never,
    indexStatus: 'indexed' as never,
    visionDescription: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-02T00:00:00Z'),
    ...overrides,
  };
}
