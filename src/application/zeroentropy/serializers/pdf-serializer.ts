import 'server-only';

import type { ParsedFile } from '@/core/file/types';
import type { IEntitySerializer } from '@/core/zeroentropy/ports/entity-serializer.port';
import {
  IndexableEntityType,
  ZeroEntropyContentKind,
} from '@/core/zeroentropy/types';
import { buildFileMetadata } from './common';

const DOC_TYPE = 'content';

export const pdfSerializer: IEntitySerializer<ParsedFile> = {
  entityType: IndexableEntityType.FILE,
  getEntityId: (entity) => entity.id,
  toIndexable(entity, organizationId) {
    if (entity.parsed.kind !== 'binary') return [];
    return [
      {
        entityId: entity.id,
        entityType: IndexableEntityType.FILE,
        organizationId,
        docType: DOC_TYPE,
        content: {
          kind: ZeroEntropyContentKind.AUTO,
          base64Data: entity.parsed.base64,
        },
        metadata: buildFileMetadata({ file: entity, docType: DOC_TYPE }),
      },
    ];
  },
};
