import 'server-only';

import type { ParsedFile } from '@/core/file/types';
import type { IEntitySerializer } from '@/core/zeroentropy/ports/entity-serializer.port';
import {
  IndexableEntityType,
  ZeroEntropyContentKind,
} from '@/core/zeroentropy/types';
import { buildFileMetadata } from './common';

const DOC_TYPE = 'content';

export const jsonSerializer: IEntitySerializer<ParsedFile> = {
  entityType: IndexableEntityType.FILE,
  getEntityId: (entity) => entity.id,
  toIndexable(entity, userId) {
    if (entity.parsed.kind !== 'text') return [];
    return [
      {
        entityId: entity.id,
        entityType: IndexableEntityType.FILE,
        userId,
        docType: DOC_TYPE,
        content: {
          kind: ZeroEntropyContentKind.TEXT,
          text: entity.parsed.text,
        },
        metadata: buildFileMetadata({ file: entity, docType: DOC_TYPE }),
      },
    ];
  },
};
