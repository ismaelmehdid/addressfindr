import { describe, expect, it } from 'vitest';
import { fakeFile } from './__test-helpers__';
import { toFileDto } from './mappers';

describe('toFileDto', () => {
  it('exposes the public DTO with ISO dates and no userId/orgId/storageKey', () => {
    const dto = toFileDto(fakeFile());
    expect(dto).toEqual({
      id: 'file-1',
      originalName: 'doc.pdf',
      mimeType: 'application/pdf',
      fileType: 'pdf',
      sizeBytes: 1234,
      status: 'uploaded',
      indexStatus: 'indexed',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    });
    expect(dto).not.toHaveProperty('userId');
    expect(dto).not.toHaveProperty('organizationId');
    expect(dto).not.toHaveProperty('storageKey');
  });
});
