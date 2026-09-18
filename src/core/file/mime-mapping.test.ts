import { describe, expect, it } from 'vitest';
import {
  DOCX_MIME_TYPE,
  isSupportedMime,
  MAX_FILE_SIZE_BYTES,
  mimeToFileType,
  SUPPORTED_MIME_TYPES,
  XLSX_MIME_TYPE,
} from './mime-mapping';
import { FileType } from './types';

describe('mimeToFileType', () => {
  it('maps standard MIME types to FileType', () => {
    expect(mimeToFileType('application/pdf')).toBe(FileType.PDF);
    expect(mimeToFileType('image/png')).toBe(FileType.PNG);
    expect(mimeToFileType('image/jpeg')).toBe(FileType.JPEG);
    expect(mimeToFileType('image/webp')).toBe(FileType.WEBP);
    expect(mimeToFileType('text/plain')).toBe(FileType.TXT);
    expect(mimeToFileType('text/csv')).toBe(FileType.CSV);
    expect(mimeToFileType('application/json')).toBe(FileType.JSON);
  });

  it('maps the long DOCX/XLSX MIME constants', () => {
    expect(mimeToFileType(DOCX_MIME_TYPE)).toBe(FileType.DOCX);
    expect(mimeToFileType(XLSX_MIME_TYPE)).toBe(FileType.XLSX);
  });

  it('returns null for unsupported MIME', () => {
    expect(mimeToFileType('video/mp4')).toBeNull();
    expect(mimeToFileType('')).toBeNull();
  });
});

describe('isSupportedMime', () => {
  it('returns true for every entry in SUPPORTED_MIME_TYPES', () => {
    for (const m of SUPPORTED_MIME_TYPES) {
      expect(isSupportedMime(m)).toBe(true);
    }
  });

  it('returns false for unknown MIME', () => {
    expect(isSupportedMime('application/x-unknown')).toBe(false);
  });
});

describe('MAX_FILE_SIZE_BYTES', () => {
  it('equals 10 MiB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});
