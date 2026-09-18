import 'server-only';

import { chunkMarkdownByHeadings } from '@/core/file/markdown-chunk';
import type { ParsedFile } from '@/core/file/types';
import type { IEntitySerializer } from '@/core/zeroentropy/ports/entity-serializer.port';
import {
  IndexableEntityType,
  ZeroEntropyContentKind,
} from '@/core/zeroentropy/types';
import { buildFileMetadata } from './common';

const DOC_TYPE = 'content';

export const docxSerializer: IEntitySerializer<ParsedFile> = {
  entityType: IndexableEntityType.FILE,
  getEntityId: (entity) => entity.id,
  toIndexable(entity, userId) {
    if (entity.parsed.kind !== 'text') return [];
    if (entity.parsed.text.trim().length === 0) return [];
    const pages = chunkMarkdownByHeadings({
      markdown: entity.parsed.text,
      sourceLabel: entity.originalName,
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
          extra: { chunkCount: pages.length },
        }),
      },
    ];
  },
};
