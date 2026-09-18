import 'server-only';

import type { ParsedFile } from '@/core/file/types';
import type { IEntitySerializer } from '@/core/zeroentropy/ports/entity-serializer.port';
import {
  IndexableEntityType,
  ZeroEntropyContentKind,
} from '@/core/zeroentropy/types';
import { buildFileMetadata } from './common';
import { buildSheetPages, type SerializableRow } from './row-pages';

const DOC_TYPE = 'content';

export const csvSerializer: IEntitySerializer<ParsedFile> = {
  entityType: IndexableEntityType.FILE,
  getEntityId: (entity) => entity.id,
  toIndexable(entity, userId) {
    if (entity.parsed.kind !== 'csv-rows') return [];
    if (entity.parsed.rows.length === 0) return [];

    const { rows, totalRows } = entity.parsed;
    const headers = Object.keys(rows[0] ?? {});
    if (headers.length === 0) return [];

    const serializableRows: SerializableRow[] = rows.map((row, i) => ({
      rowLabel: i + 1,
      pairs: headers.map((h) => ({ key: h, value: row[h] ?? '' })),
    }));

    const pages = buildSheetPages({
      sheetName: entity.originalName,
      headers,
      rows: serializableRows,
      totalRows,
      truncated: totalRows > rows.length,
    });
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
            rowCount: rows.length,
            totalRows,
            columnCount: headers.length,
          },
        }),
      },
    ];
  },
};
