import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACHMENTS_BYTES_PER_TURN,
  MAX_ATTACHMENTS_PER_TURN,
  validateAttachmentBatch,
} from './attachment-rules';

describe('validateAttachmentBatch', () => {
  it('accepts an empty batch', () => {
    const result = validateAttachmentBatch([]);
    expect(result.isOk()).toBe(true);
  });

  it('accepts a batch at the file-count limit', () => {
    const batch = Array.from({ length: MAX_ATTACHMENTS_PER_TURN }, () => ({
      sizeBytes: 1,
    }));
    expect(validateAttachmentBatch(batch).isOk()).toBe(true);
  });

  it('rejects a batch exceeding the file-count limit', () => {
    const batch = Array.from({ length: MAX_ATTACHMENTS_PER_TURN + 1 }, () => ({
      sizeBytes: 1,
    }));
    const result = validateAttachmentBatch(batch);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('validation');
    }
  });

  it('accepts a batch exactly at the byte limit', () => {
    const result = validateAttachmentBatch([
      { sizeBytes: MAX_ATTACHMENTS_BYTES_PER_TURN },
    ]);
    expect(result.isOk()).toBe(true);
  });

  it('rejects a batch exceeding the byte limit by 1', () => {
    const result = validateAttachmentBatch([
      { sizeBytes: MAX_ATTACHMENTS_BYTES_PER_TURN + 1 },
    ]);
    expect(result.isErr()).toBe(true);
  });

  it('sums sizes across multiple attachments', () => {
    const half = Math.floor(MAX_ATTACHMENTS_BYTES_PER_TURN / 2);
    const ok = validateAttachmentBatch([
      { sizeBytes: half },
      { sizeBytes: half },
    ]);
    expect(ok.isOk()).toBe(true);

    const overflow = validateAttachmentBatch([
      { sizeBytes: half + 1 },
      { sizeBytes: half + 1 },
    ]);
    expect(overflow.isErr()).toBe(true);
  });
});
