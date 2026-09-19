import 'server-only';

import type { ParsedFile } from '@/core/file/types';
import type { IEntitySerializer } from '@/core/zeroentropy/ports/entity-serializer.port';
import {
  type EntityToIndex,
  IndexableEntityType,
  ZeroEntropyContentKind,
} from '@/core/zeroentropy/types';
import { buildFileMetadata } from './common';

const BINARY_DOC_TYPE = 'content';
const VISION_DOC_TYPE = 'vision-description';

export const imageSerializer: IEntitySerializer<ParsedFile> = {
  entityType: IndexableEntityType.FILE,
  getEntityId: (entity) => entity.id,
  toIndexable(entity, userId) {
    if (entity.parsed.kind !== 'image') return [];
    const out: EntityToIndex[] = [
      {
        entityId: entity.id,
        entityType: IndexableEntityType.FILE,
        userId,
        docType: BINARY_DOC_TYPE,
        content: {
          kind: ZeroEntropyContentKind.AUTO,
          base64Data: entity.parsed.base64,
        },
        metadata: buildFileMetadata({
          file: entity,
          docType: BINARY_DOC_TYPE,
        }),
      },
    ];
    const description = entity.visionDescription?.trim() ?? '';
    if (description.length > 0) {
      out.push({
        entityId: entity.id,
        entityType: IndexableEntityType.FILE,
        userId,
        docType: VISION_DOC_TYPE,
        content: {
          kind: ZeroEntropyContentKind.TEXT,
          text: description,
        },
        metadata: buildFileMetadata({
          file: entity,
          docType: VISION_DOC_TYPE,
        }),
      });
    }
    return out;
  },
};
