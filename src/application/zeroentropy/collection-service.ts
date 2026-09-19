import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import {
  type CollectionInfo,
  CollectionStatus,
} from '@/core/zeroentropy/types';
import {
  claimCollectionCreation,
  getCollectionByUser,
  insertCollection,
  updateCollectionStatus,
} from '@/infra/data-access/zeroentropy/collection-repo';
import { zeroEntropyClient } from '@/infra/external-apis/zeroentropy/client';
import { log } from '@/shared/logger';
import { generateCollectionName } from './collection-name';

export async function ensureCollection(
  userId: string,
): Promise<Result<CollectionInfo, AppError>> {
  const fastPath = await getCollectionByUser(userId);
  if (fastPath.isErr()) return err(fastPath.error);
  if (fastPath.value && fastPath.value.status === CollectionStatus.ACTIVE) {
    return ok(fastPath.value);
  }

  // Deterministic by userId alone — claimCollectionCreation relies on every
  // caller producing the same name.
  const collectionName = generateCollectionName({ userId });

  const claimed = await claimCollectionCreation({ userId, collectionName });
  if (claimed.isErr()) return err(claimed.error);
  if (claimed.value) return ok(claimed.value);

  const created = await zeroEntropyClient.createCollection(collectionName);
  if (created.isErr()) {
    const existingRow = await getCollectionByUser(userId);
    if (existingRow.isOk() && existingRow.value) {
      await updateCollectionStatus({
        collectionId: existingRow.value.id,
        status: CollectionStatus.ERROR,
        lastSyncError: created.error.message,
      });
    }
    return err(created.error);
  }

  const persisted = await insertCollection({
    userId,
    collectionName,
    status: CollectionStatus.ACTIVE,
  });
  if (persisted.isErr()) return err(persisted.error);

  log.info('ZeroEntropy collection ensured', {
    userId,
    collectionName,
  });
  return ok(persisted.value);
}
