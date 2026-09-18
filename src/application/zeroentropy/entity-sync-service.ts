import 'server-only';

import { createHash } from 'node:crypto';
import { err, ok, type Result } from 'neverthrow';
import pLimit from 'p-limit';
import { type AppError, externalApi } from '@/core/errors';
import {
  EntityIndexStatus,
  type EntityToIndex,
  type IndexableEntityType,
  ZeroEntropyContentKind,
} from '@/core/zeroentropy/types';
import { getCollectionByOrg } from '@/infra/data-access/zeroentropy/collection-repo';
import {
  deleteIndexedEntityDocs,
  getIndexedEntity,
  upsertIndexedEntity,
} from '@/infra/data-access/zeroentropy/entity-index-repo';
import { withEntityLock } from '@/infra/data-access/zeroentropy/entity-lock';
import { zeroEntropyClient } from '@/infra/external-apis/zeroentropy/client';
import { log } from '@/shared/logger';
import {
  addCurrentSpanAttributes,
  withSpan,
} from '@/shared/telemetry/with-span';
import { ensureCollection } from './collection-service';
import { type FetchedEntity, fetchEntityData } from './fetch-entity-data';

function contentPayload(doc: EntityToIndex): string {
  switch (doc.content.kind) {
    case ZeroEntropyContentKind.TEXT:
      return doc.content.text;
    case ZeroEntropyContentKind.TEXT_PAGES_UNORDERED:
      return doc.content.pages.join('\n\n');
    case ZeroEntropyContentKind.AUTO:
      return doc.content.base64Data;
  }
}

function hashContent(doc: EntityToIndex): string {
  return createHash('sha256')
    .update(contentPayload(doc))
    .digest('hex')
    .slice(0, 16);
}

function computeCompositeHash(docs: EntityToIndex[]): string {
  const sorted = [...docs].sort((a, b) => a.docType.localeCompare(b.docType));
  const combined = sorted
    .map((d) => `${d.docType}:${hashContent(d)}`)
    .join('|');
  return createHash('sha256').update(combined).digest('hex').slice(0, 16);
}

function documentPath(d: EntityToIndex): string {
  return `entities/${d.organizationId}/${d.entityType}/${d.entityId}/${d.docType}`;
}

function serializeFetched(
  fetched: FetchedEntity,
  organizationId: string,
): EntityToIndex[] {
  return fetched.serializer.toIndexable(fetched.entity, organizationId);
}

function pathForDocType(args: {
  organizationId: string;
  entityType: IndexableEntityType;
  entityId: string;
  docType: string;
}): string {
  return `entities/${args.organizationId}/${args.entityType}/${args.entityId}/${args.docType}`;
}

export async function indexEntity(args: {
  organizationId: string;
  entityType: IndexableEntityType;
  entityId: string;
}): Promise<Result<void, AppError>> {
  return withSpan({
    name: 'chat.indexing.entity',
    attributes: {
      'entity.type': args.entityType,
      'entity.id': args.entityId,
    },
    fn: () =>
      withEntityLock({
        entityType: args.entityType,
        entityId: args.entityId,
        fn: () => indexEntityLocked(args),
      }),
  });
}

async function indexEntityLocked(args: {
  organizationId: string;
  entityType: IndexableEntityType;
  entityId: string;
}): Promise<Result<void, AppError>> {
  const collection = await ensureCollection(args.organizationId);
  if (collection.isErr()) return err(collection.error);

  const fetched = await fetchEntityData({
    entityType: args.entityType,
    entityId: args.entityId,
    organizationId: args.organizationId,
  });
  if (fetched.isErr()) return err(fetched.error);

  const documents = serializeFetched(fetched.value, args.organizationId);
  if (documents.length === 0) {
    // The entity has no indexable content anymore (e.g. a file whose
    // content was emptied). Returning early would leave the previously
    // indexed docs in ZE, so they keep surfacing in RAG. Remove them instead —
    // removeEntityLocked no-ops when nothing was indexed. We're already holding
    // the entity lock, so call the locked variant directly (not removeEntity).
    return removeEntityLocked(args);
  }

  const compositeHash = computeCompositeHash(documents);
  const docTypes = documents.map((d) => d.docType);

  const existing = await getIndexedEntity({
    collectionId: collection.value.id,
    entityType: args.entityType,
    entityId: args.entityId,
  });
  if (existing.isErr()) return err(existing.error);

  if (existing.value && existing.value.contentHash === compositeHash) {
    addCurrentSpanAttributes({
      'indexing.skipped': true,
      'indexing.skip_reason': 'unchanged-hash',
      'indexing.doc_count': documents.length,
    });
    log.info('Entity unchanged, skipping', {
      organizationId: args.organizationId,
      entityType: args.entityType,
      entityId: args.entityId,
    });
    return ok(undefined);
  }

  addCurrentSpanAttributes({
    'indexing.doc_count': documents.length,
    'indexing.skipped': false,
  });

  const upload = await zeroEntropyClient.addDocuments({
    collectionName: collection.value.collectionName,
    documents,
  });
  if (upload.isErr()) {
    const persistedErr = await upsertIndexedEntity({
      collectionId: collection.value.id,
      entityType: args.entityType,
      entityId: args.entityId,
      docTypes,
      contentHash: compositeHash,
      status: EntityIndexStatus.ERROR,
      lastError: upload.error.message,
    });
    if (persistedErr.isErr()) return err(persistedErr.error);
    return err(upload.error);
  }

  if (upload.value.failedDocuments.length > 0) {
    const failed = upload.value.failedDocuments;
    const errorMessage = failed.map((f) => `${f.path}: ${f.error}`).join('; ');
    const persistedErr = await upsertIndexedEntity({
      collectionId: collection.value.id,
      entityType: args.entityType,
      entityId: args.entityId,
      docTypes,
      contentHash: compositeHash,
      status: EntityIndexStatus.ERROR,
      lastError: errorMessage,
    });
    if (persistedErr.isErr()) return err(persistedErr.error);
    log.warn('Entity partially indexed, marked ERROR', {
      organizationId: args.organizationId,
      entityType: args.entityType,
      entityId: args.entityId,
      failedCount: failed.length,
    });
    const first = failed[0];
    return err(
      externalApi(
        'zeroentropy',
        `Failed to index ${failed.length} docs: ${first?.error ?? 'unknown error'}`,
      ),
    );
  }

  if (existing.value) {
    const newDocTypeSet = new Set(docTypes);
    const orphanDocTypes = existing.value.docTypes.filter(
      (d) => !newDocTypeSet.has(d),
    );
    if (orphanDocTypes.length > 0) {
      const orphanLimit = pLimit(8);
      await Promise.all(
        orphanDocTypes.map((docType) =>
          orphanLimit(async () => {
            const path = pathForDocType({
              organizationId: args.organizationId,
              entityType: args.entityType,
              entityId: args.entityId,
              docType,
            });
            const removed = await zeroEntropyClient.deleteDocument({
              collectionName: collection.value.collectionName,
              path,
            });
            if (removed.isErr()) {
              log.warn('Failed to delete orphan ZE doc', {
                organizationId: args.organizationId,
                entityType: args.entityType,
                entityId: args.entityId,
                docType,
                error: removed.error.message,
              });
            }
          }),
        ),
      );
      log.info('ZE orphan docs cleaned up', {
        entityType: args.entityType,
        entityId: args.entityId,
        orphanCount: orphanDocTypes.length,
      });
    }
  }

  const persisted = await upsertIndexedEntity({
    collectionId: collection.value.id,
    entityType: args.entityType,
    entityId: args.entityId,
    docTypes,
    contentHash: compositeHash,
    status: EntityIndexStatus.INDEXED,
    lastError: null,
  });
  if (persisted.isErr()) return err(persisted.error);

  log.info('Entity indexed', {
    organizationId: args.organizationId,
    entityType: args.entityType,
    entityId: args.entityId,
    docCount: documents.length,
  });
  return ok(undefined);
}

export async function removeEntity(args: {
  organizationId: string;
  entityType: IndexableEntityType;
  entityId: string;
}): Promise<Result<void, AppError>> {
  return withEntityLock({
    entityType: args.entityType,
    entityId: args.entityId,
    fn: () => removeEntityLocked(args),
  });
}

async function removeEntityLocked(args: {
  organizationId: string;
  entityType: IndexableEntityType;
  entityId: string;
}): Promise<Result<void, AppError>> {
  const collection = await getCollectionByOrg(args.organizationId);
  if (collection.isErr()) return err(collection.error);
  if (!collection.value) {
    return ok(undefined);
  }

  const existing = await getIndexedEntity({
    collectionId: collection.value.id,
    entityType: args.entityType,
    entityId: args.entityId,
  });
  if (existing.isErr()) return err(existing.error);
  if (!existing.value) {
    return ok(undefined);
  }

  const collectionName = collection.value.collectionName;
  const removeLimit = pLimit(8);
  let anyDeleteFailed = false;
  await Promise.all(
    existing.value.docTypes.map((docType) =>
      removeLimit(async () => {
        const path = pathForDocType({
          organizationId: args.organizationId,
          entityType: args.entityType,
          entityId: args.entityId,
          docType,
        });
        const removed = await zeroEntropyClient.deleteDocument({
          collectionName,
          path,
        });
        if (removed.isErr()) {
          anyDeleteFailed = true;
          log.warn('Failed to delete ZE document', {
            organizationId: args.organizationId,
            entityType: args.entityType,
            entityId: args.entityId,
            docType,
            error: removed.error.message,
          });
        }
      }),
    ),
  );

  // Keep the local index record so retryDueOperations re-attempts the ZE deletes;
  // purging it now would orphan the surviving docs (they still surface in RAG).
  if (anyDeleteFailed) {
    return err(
      externalApi('zeroentropy', 'Failed to delete one or more ZE documents'),
    );
  }

  const purge = await deleteIndexedEntityDocs({
    collectionId: collection.value.id,
    entityType: args.entityType,
    entityId: args.entityId,
  });
  if (purge.isErr()) return err(purge.error);

  log.info('Entity removed from ZE', {
    organizationId: args.organizationId,
    entityType: args.entityType,
    entityId: args.entityId,
    docCount: existing.value.docTypes.length,
  });
  return ok(undefined);
}

export { documentPath };
