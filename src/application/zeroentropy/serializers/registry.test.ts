import { describe, expect, it } from 'vitest';
import { FileType } from '@/core/file/types';
import { csvSerializer } from './csv-serializer';
import { docxSerializer } from './docx-serializer';
import { imageSerializer } from './image-serializer';
import { jsonSerializer } from './json-serializer';
import { pdfSerializer } from './pdf-serializer';
import { getFileSerializer } from './registry';
import { txtSerializer } from './txt-serializer';
import { xlsxSerializer } from './xlsx-serializer';

describe('getFileSerializer', () => {
  it('returns the correct serializer for each file type', () => {
    expect(getFileSerializer(FileType.PDF)).toBe(pdfSerializer);
    expect(getFileSerializer(FileType.DOCX)).toBe(docxSerializer);
    expect(getFileSerializer(FileType.XLSX)).toBe(xlsxSerializer);
    expect(getFileSerializer(FileType.TXT)).toBe(txtSerializer);
    expect(getFileSerializer(FileType.CSV)).toBe(csvSerializer);
    expect(getFileSerializer(FileType.JSON)).toBe(jsonSerializer);
  });

  it('all three image types use the imageSerializer', () => {
    expect(getFileSerializer(FileType.PNG)).toBe(imageSerializer);
    expect(getFileSerializer(FileType.JPEG)).toBe(imageSerializer);
    expect(getFileSerializer(FileType.WEBP)).toBe(imageSerializer);
  });
});
