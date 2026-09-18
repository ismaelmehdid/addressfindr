import 'server-only';

import { and, eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, unknown } from '@/core/errors';
import type {
  EntityIndexStatus,
  IndexableEntityType,
  IndexedEntityRecord,
} from '@/core/zeroentropy/types';
import { db } from '@/infra/database/connection';
import { zeroentropyEntity } from '@/infra/database/schema/zeroentropy-schema';
import { log } from '@/shared/logger';

type EntityRow = typeof zeroentropyEntity.$inferSelect;

function rowToRecord(row: EntityRow): IndexedEntityRecord {
  return {
    id: row.id,
    collectionId: row.collectionId,
    entityType: row.entityType as IndexableEntityType,
    entityId: row.entityId,
    docTypes: row.docTypes,
    contentHash: row.contentHash,
    status: row.status as EntityIndexStatus,
    lastError: row.lastError ?? null,
    lastIndexedAt: row.lastIndexedAt ?? null,
  };
}

export async function getIndexedEntity(args: {
  collectionId: string;
  entityType: IndexableEntityType;
  entityId: string;
}): Promise<Result<IndexedEntityRecord | null, AppError>> {
  try {
    const [row] = await db
      .select()
      .from(zeroentropyEntity)
      .where(
        and(
          eq(zeroentropyEntity.collectionId, args.collectionId),
          eq(zeroentropyEntity.entityType, args.entityType),
          eq(zeroentropyEntity.entityId, args.entityId),
        ),
      )
      .limit(1);
    return ok(row ? rowToRecord(row) : null);
  } catch (e) {
    log.error('Failed to fetch indexed entity', e, args);
    return err(unknown('Failed to fetch indexed entity'));
  }
}

export async function upsertIndexedEntity(args: {
  collectionId: string;
  entityType: IndexableEntityType;
  entityId: string;
  docTypes: string[];
  contentHash: string;
  status: EntityIndexStatus;
  lastError?: string | null;
}): Promise<Result<IndexedEntityRecord, AppError>> {
  try {
    const lastIndexedAt = args.status === 'indexed' ? new Date() : null;
    const [row] = await db
      .insert(zeroentropyEntity)
      .values({
        collectionId: args.collectionId,
        entityType: args.entityType,
        entityId: args.entityId,
        docTypes: args.docTypes,
        contentHash: args.contentHash,
        status: args.status,
        lastError: args.lastError ?? null,
        lastIndexedAt,
      })
      .onConflictDoUpdate({
        target: [
          zeroentropyEntity.collectionId,
          zeroentropyEntity.entityType,
          zeroentropyEntity.entityId,
        ],
        set: {
          docTypes: args.docTypes,
          contentHash: args.contentHash,
          status: args.status,
          lastError: args.lastError ?? null,
          lastIndexedAt,
        },
      })
      .returning();
    if (!row) return err(unknown('Failed to upsert indexed entity'));
    return ok(rowToRecord(row));
  } catch (e) {
    log.error('Failed to upsert indexed entity', e, args);
    return err(unknown('Failed to upsert indexed entity'));
  }
}

export async function deleteIndexedEntityDocs(args: {
  collectionId: string;
  entityType: IndexableEntityType;
  entityId: string;
}): Promise<Result<void, AppError>> {
  try {
    await db
      .delete(zeroentropyEntity)
      .where(
        and(
          eq(zeroentropyEntity.collectionId, args.collectionId),
          eq(zeroentropyEntity.entityType, args.entityType),
          eq(zeroentropyEntity.entityId, args.entityId),
        ),
      );
    return ok(undefined);
  } catch (e) {
    log.error('Failed to delete indexed entity docs', e, args);
    return err(unknown('Failed to delete indexed entity docs'));
  }
}
