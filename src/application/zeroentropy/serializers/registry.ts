import 'server-only';

import type { FileType, ParsedFile } from '@/core/file/types';
import { FileType as Ft } from '@/core/file/types';
import type { IEntitySerializer } from '@/core/zeroentropy/ports/entity-serializer.port';
import { csvSerializer } from './csv-serializer';
import { docxSerializer } from './docx-serializer';
import { imageSerializer } from './image-serializer';
import { jsonSerializer } from './json-serializer';
import { pdfSerializer } from './pdf-serializer';
import { txtSerializer } from './txt-serializer';
import { xlsxSerializer } from './xlsx-serializer';

const REGISTRY: Record<FileType, IEntitySerializer<ParsedFile>> = {
  [Ft.PDF]: pdfSerializer,
  [Ft.DOCX]: docxSerializer,
  [Ft.XLSX]: xlsxSerializer,
  [Ft.PNG]: imageSerializer,
  [Ft.JPEG]: imageSerializer,
  [Ft.WEBP]: imageSerializer,
  [Ft.TXT]: txtSerializer,
  [Ft.CSV]: csvSerializer,
  [Ft.JSON]: jsonSerializer,
};

export function getFileSerializer(
  fileType: FileType,
): IEntitySerializer<ParsedFile> {
  return REGISTRY[fileType];
}
