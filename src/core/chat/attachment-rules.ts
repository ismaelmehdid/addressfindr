import { err, ok, type Result } from 'neverthrow';
import { type AppError, validation } from '@/core/errors';

export const MAX_ATTACHMENTS_PER_TURN = 5;
export const MAX_ATTACHMENTS_BYTES_PER_TURN = 10 * 1024 * 1024;

export type AttachmentSize = { sizeBytes: number };

export function validateAttachmentBatch(
  attachments: ReadonlyArray<AttachmentSize>,
): Result<void, AppError> {
  if (attachments.length > MAX_ATTACHMENTS_PER_TURN) {
    return err(
      validation(
        `Too many attachments: ${attachments.length} (max ${MAX_ATTACHMENTS_PER_TURN}).`,
        'attachments',
      ),
    );
  }
  const total = attachments.reduce((sum, a) => sum + a.sizeBytes, 0);
  if (total > MAX_ATTACHMENTS_BYTES_PER_TURN) {
    return err(
      validation(
        `Attachments size ${total} bytes exceeds limit ${MAX_ATTACHMENTS_BYTES_PER_TURN}.`,
        'attachments',
      ),
    );
  }
  return ok(undefined);
}
