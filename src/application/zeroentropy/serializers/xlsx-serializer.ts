import 'server-only';

import type { ParsedFile, ParsedFileSpreadsheetSheet } from '@/core/file/types';
import type { IEntitySerializer } from '@/core/zeroentropy/ports/entity-serializer.port';
import {
  IndexableEntityType,
  ZeroEntropyContentKind,
} from '@/core/zeroentropy/types';
import { buildFileMetadata } from './common';
import { buildSheetPages, type SerializableRow } from './row-pages';

const DOC_TYPE = 'content';

function sheetToPages(
  sheet: ParsedFileSpreadsheetSheet,
  sourceLabel: string,
): string[] {
  if (sheet.headers.length === 0 || sheet.rows.length === 0) return [];
  const headers = sheet.headers.map((h, i) => (h.length > 0 ? h : `col${i}`));
  const rows: SerializableRow[] = sheet.rows.map((row, i) => ({
    rowLabel: i + 1,
    pairs: headers.map((h, c) => ({ key: h, value: row[c] ?? '' })),
  }));
  return buildSheetPages({
    sourceLabel,
    sheetName: sheet.name,
    headers,
    rows,
    totalRows: sheet.totalRows,
    truncated: sheet.truncated,
  });
}

export const xlsxSerializer: IEntitySerializer<ParsedFile> = {
  entityType: IndexableEntityType.FILE,
  getEntityId: (entity) => entity.id,
  toIndexable(entity, userId) {
    if (entity.parsed.kind !== 'spreadsheet-sheets') return [];
    if (entity.parsed.sheets.length === 0) return [];
    const pages = entity.parsed.sheets.flatMap((sheet) =>
      sheetToPages(sheet, entity.originalName),
    );
    if (pages.length === 0) return [];
    return [
      {
        entityId: entity.id,
        entityType: IndexableEntityType.FILE,
        userId,
        docType: DOC_TYPE,
        content: {
          kind: ZeroEntropyContentKind.TEXT_PAGES_UNORDERED,
          pages,
        },
        metadata: buildFileMetadata({
          file: entity,
          docType: DOC_TYPE,
          extra: {
            sheetCount: entity.parsed.sheets.length,
            totalRows: entity.parsed.sheets.reduce(
              (sum, s) => sum + s.totalRows,
              0,
            ),
          },
        }),
      },
    ];
  },
};
