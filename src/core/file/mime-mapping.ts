import { FileType } from './types';

export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MIME_TO_FILE_TYPE: Record<string, FileType> = {
  'application/pdf': FileType.PDF,
  [DOCX_MIME_TYPE]: FileType.DOCX,
  [XLSX_MIME_TYPE]: FileType.XLSX,
  'image/png': FileType.PNG,
  'image/jpeg': FileType.JPEG,
  'image/webp': FileType.WEBP,
  'text/plain': FileType.TXT,
  'text/csv': FileType.CSV,
  'application/json': FileType.JSON,
};

export const SUPPORTED_MIME_TYPES = Object.keys(MIME_TO_FILE_TYPE);

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function mimeToFileType(mimeType: string): FileType | null {
  return MIME_TO_FILE_TYPE[mimeType] ?? null;
}

export function isSupportedMime(mimeType: string): boolean {
  return mimeType in MIME_TO_FILE_TYPE;
}
