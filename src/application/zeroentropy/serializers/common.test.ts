import { describe, expect, it } from 'vitest';
import type { FileEntity } from '@/core/file/types';
import { FileType } from '@/core/file/types';
import { buildFileMetadata } from './common';

function file(): FileEntity {
  return {
    id: 'file-1',
    userId: 'user-1',
    organizationId: 'org-1',
    originalName: 'report.pdf',
    storageKey: { bucket: 'files', objectPath: 'p' } as never,
    mimeType: 'application/pdf' as never,
    fileType: FileType.PDF,
    sizeBytes: 12345,
    status: 'uploaded' as never,
    indexStatus: 'indexed' as never,
    visionDescription: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-02T03:04:05Z'),
  };
}

describe('buildFileMetadata', () => {
  it('produces canonical metadata with file fields', () => {
    const meta = buildFileMetadata({ file: file(), docType: 'extracted' });
    expect(meta.entityType).toBe('file');
    expect(meta.entityId).toBe('file-1');
    expect(meta.organizationId).toBe('org-1');
    expect(meta.updatedAt).toBe('2024-01-02T03:04:05.000Z');
    expect(meta.docType).toBe('extracted');
    expect(meta.source).toBe('user_upload');
    expect(meta.fileName).toBe('report.pdf');
    expect(meta.fileType).toBe('pdf');
    expect(meta.mimeType).toBe('application/pdf');
    expect(meta.sizeBytes).toBe(12345);
  });

  it('merges extra metadata fields', () => {
    const meta = buildFileMetadata({
      file: file(),
      docType: 'extracted',
      extra: { pageCount: 5, hasImages: true, tag: 'invoice' },
    });
    expect(meta.pageCount).toBe(5);
    expect(meta.hasImages).toBe(true);
    expect(meta.tag).toBe('invoice');
  });

  it('extra fields override canonical fields when keys collide', () => {
    const meta = buildFileMetadata({
      file: file(),
      docType: 'a',
      extra: { docType: 'override' },
    });
    expect(meta.docType).toBe('override');
  });
});
