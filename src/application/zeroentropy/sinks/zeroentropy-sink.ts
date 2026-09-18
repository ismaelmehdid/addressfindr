import 'server-only';

import { err, type Result } from 'neverthrow';
import { type AppError, validation } from '@/core/errors';
import type { ISyncSink } from '@/core/zeroentropy/ports/sync-sink.port';
import {
  type EntityChangeEvent,
  SyncOperation,
} from '@/core/zeroentropy/types';
import { indexEntity, removeEntity } from '../entity-sync-service';

async function handle(
  event: EntityChangeEvent,
): Promise<Result<void, AppError>> {
  switch (event.operation) {
    case SyncOperation.CREATE:
    case SyncOperation.UPDATE:
      return indexEntity({
        userId: event.userId,
        entityType: event.entityType,
        entityId: event.entityId,
      });
    case SyncOperation.DELETE:
      return removeEntity({
        userId: event.userId,
        entityType: event.entityType,
        entityId: event.entityId,
      });
    default:
      return err(
        validation(
          `Unsupported sync operation: ${event.operation}`,
          'operation',
        ),
      );
  }
}

export const zeroEntropySink: ISyncSink = {
  name: 'zeroentropy',
  handle,
};
