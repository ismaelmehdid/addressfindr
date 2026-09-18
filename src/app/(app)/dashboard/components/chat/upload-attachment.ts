import { validateMagicBytes } from '@/app/(app)/dashboard/storage/components/validate-magic-bytes';
import {
  ALLOWED_MIME_TYPES,
  type AllowedMimeType,
} from '@/application/storage/dto';
import { MAX_FILE_SIZE_BYTES } from '@/core/file/mime-mapping';

export type UploadAttachmentErrorCode =
  | 'size'
  | 'type'
  | 'mimeMismatch'
  | 'initiate'
  | 'upload'
  | 'finalize';

export class UploadAttachmentError extends Error {
  code: UploadAttachmentErrorCode;
  constructor(code: UploadAttachmentErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export type UploadedAttachment = {
  fileId: string;
  signedUrl: string;
  mimeType: AllowedMimeType;
  originalName: string;
  sizeBytes: number;
};

export async function uploadAttachment(
  file: File,
): Promise<UploadedAttachment> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new UploadAttachmentError('size');
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type as AllowedMimeType)) {
    throw new UploadAttachmentError('type');
  }
  const matches = await validateMagicBytes(file, file.type);
  if (!matches) {
    throw new UploadAttachmentError('mimeMismatch');
  }

  const initRes = await fetch('/api/files/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }),
  });
  if (!initRes.ok) {
    throw new UploadAttachmentError('initiate');
  }
  const init = (await initRes.json()) as {
    fileId: string;
    signedUrl: string;
    token: string;
  };

  const uploadRes = await fetch(init.signedUrl, {
    method: 'PUT',
    headers: {
      'content-type': file.type,
      authorization: `Bearer ${init.token}`,
      'x-upsert': 'false',
    },
    body: file,
  });
  if (!uploadRes.ok) {
    await fetch(`/api/files/${init.fileId}`, { method: 'DELETE' }).catch(
      () => undefined,
    );
    throw new UploadAttachmentError('upload');
  }

  const finalizeRes = await fetch('/api/files/finalize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileId: init.fileId }),
  });
  if (!finalizeRes.ok) {
    throw new UploadAttachmentError('finalize');
  }
  const finalized = (await finalizeRes.json()) as {
    file: { id: string; originalName: string; mimeType: string };
    signedUrl: string;
  };

  return {
    fileId: finalized.file.id,
    signedUrl: finalized.signedUrl,
    mimeType: file.type as AllowedMimeType,
    originalName: finalized.file.originalName,
    sizeBytes: file.size,
  };
}
