import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { getOrganizationName } from '@/application/organization/get-organization-name';
import type { AppError } from '@/core/errors';
import {
  type CollectionInfo,
  CollectionStatus,
} from '@/core/zeroentropy/types';
import {
  claimCollectionCreation,
  getCollectionByOrg,
  insertCollection,
  updateCollectionStatus,
} from '@/infra/data-access/zeroentropy/collection-repo';
import { zeroEntropyClient } from '@/infra/external-apis/zeroentropy/client';
import { log } from '@/shared/logger';
import { generateCollectionName } from './collection-name';

export async function ensureCollection(
  organizationId: string,
): Promise<Result<CollectionInfo, AppError>> {
  const fastPath = await getCollectionByOrg(organizationId);
  if (fastPath.isErr()) return err(fastPath.error);
  if (fastPath.value && fastPath.value.status === CollectionStatus.ACTIVE) {
    return ok(fastPath.value);
  }

  const nameResult = await getOrganizationName(organizationId);
  if (nameResult.isErr()) return err(nameResult.error);

  const collectionName = generateCollectionName({
    organizationId,
    organizationName: nameResult.value,
  });

  const claimed = await claimCollectionCreation({
    organizationId,
    collectionName,
  });
  if (claimed.isErr()) return err(claimed.error);
  if (claimed.value) return ok(claimed.value);

  const created = await zeroEntropyClient.createCollection(collectionName);
  if (created.isErr()) {
    const existingRow = await getCollectionByOrg(organizationId);
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
    organizationId,
    collectionName,
    status: CollectionStatus.ACTIVE,
  });
  if (persisted.isErr()) return err(persisted.error);

  log.info('ZeroEntropy collection ensured', {
    organizationId,
    collectionName,
  });
  return ok(persisted.value);
}
