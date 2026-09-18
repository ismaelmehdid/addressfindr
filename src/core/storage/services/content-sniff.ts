import { fileTypeFromBuffer } from 'file-type';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, validation } from '@/core/errors';
import type { MimeType } from '@/core/storage/types/file';

const MIME_ALIASES: Record<string, ReadonlyArray<string>> = {
  'application/pdf': ['application/pdf'],
  'image/png': ['image/png'],
  'image/jpeg': ['image/jpeg', 'image/jpg'],
  'image/webp': ['image/webp'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
  ],
  'text/plain': ['text/plain'],
  'text/csv': ['text/csv', 'text/plain'],
  'application/json': ['application/json', 'text/plain'],
};

export async function assertMimeMatchesBytes(args: {
  bytes: Uint8Array;
  expected: MimeType;
}): Promise<Result<void, AppError>> {
  const sniffed = await fileTypeFromBuffer(args.bytes);
  if (!sniffed) {
    if (isTextLike(args.expected)) return ok(undefined);
    return err(
      validation(
        `Uploaded content does not match declared type ${args.expected}`,
        'content',
      ),
    );
  }
  const allowed = MIME_ALIASES[args.expected] ?? [args.expected];
  if (!allowed.includes(sniffed.mime)) {
    return err(
      validation(
        `Uploaded content type ${sniffed.mime} does not match declared ${args.expected}`,
        'content',
      ),
    );
  }
  return ok(undefined);
}

function isTextLike(mime: string): boolean {
  return (
    mime === 'text/plain' || mime === 'text/csv' || mime === 'application/json'
  );
}
