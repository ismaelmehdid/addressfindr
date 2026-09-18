import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, notFound, unknown } from '@/core/errors';
import {
  type CollectionInfo,
  CollectionStatus,
  type CollectionStatus as CollectionStatusType,
} from '@/core/zeroentropy/types';
import { db } from '@/infra/database/connection';
import { zeroentropyCollection } from '@/infra/database/schema/zeroentropy-schema';
import { log } from '@/shared/logger';

type CollectionRow = typeof zeroentropyCollection.$inferSelect;

function rowToInfo(row: CollectionRow): CollectionInfo {
  return {
    id: row.id,
    collectionName: row.collectionName,
    organizationId: row.organizationId,
    status: row.status as CollectionStatusType,
    documentCount: row.documentCount,
    lastSyncAt: row.lastSyncAt ?? null,
    lastSyncError: row.lastSyncError ?? null,
  };
}

export async function getCollectionByOrg(
  organizationId: string,
): Promise<Result<CollectionInfo | null, AppError>> {
  try {
    const [row] = await db
      .select()
      .from(zeroentropyCollection)
      .where(eq(zeroentropyCollection.organizationId, organizationId))
      .limit(1);
    return ok(row ? rowToInfo(row) : null);
  } catch (e) {
    log.error('Failed to fetch collection', e, { organizationId });
    return err(unknown('Failed to fetch collection'));
  }
}

export async function insertCollection(args: {
  organizationId: string;
  collectionName: string;
  status: CollectionStatusType;
}): Promise<Result<CollectionInfo, AppError>> {
  try {
    const [row] = await db
      .insert(zeroentropyCollection)
      .values({
        organizationId: args.organizationId,
        collectionName: args.collectionName,
        status: args.status,
      })
      .onConflictDoUpdate({
        target: zeroentropyCollection.organizationId,
        set: { collectionName: args.collectionName, status: args.status },
      })
      .returning();
    if (!row) return err(unknown('Failed to insert collection'));
    return ok(rowToInfo(row));
  } catch (e) {
    log.error('Failed to insert collection', e, args);
    return err(unknown('Failed to insert collection'));
  }
}

export async function updateCollectionStatus(args: {
  collectionId: string;
  status: CollectionStatusType;
  lastSyncError?: string | null;
}): Promise<Result<CollectionInfo, AppError>> {
  try {
    const [row] = await db
      .update(zeroentropyCollection)
      .set({
        status: args.status,
        ...(args.lastSyncError !== undefined
          ? { lastSyncError: args.lastSyncError }
          : {}),
      })
      .where(eq(zeroentropyCollection.id, args.collectionId))
      .returning();
    if (!row) return err(notFound('Collection not found', 'collection'));
    return ok(rowToInfo(row));
  } catch (e) {
    log.error('Failed to update collection status', e, args);
    return err(unknown('Failed to update collection status'));
  }
}

export async function setCollectionLastSync(args: {
  collectionId: string;
  error: string | null;
}): Promise<Result<void, AppError>> {
  try {
    await db
      .update(zeroentropyCollection)
      .set({
        lastSyncAt: new Date(),
        lastSyncError: args.error,
        status: args.error ? 'error' : 'active',
      })
      .where(eq(zeroentropyCollection.id, args.collectionId));
    return ok(undefined);
  } catch (e) {
    log.error('Failed to update collection lastSync', e, args);
    return err(unknown('Failed to update collection lastSync'));
  }
}

export async function incrementDocumentCount(args: {
  collectionId: string;
  delta: number;
}): Promise<Result<void, AppError>> {
  try {
    await db
      .update(zeroentropyCollection)
      .set({
        documentCount: sql`${zeroentropyCollection.documentCount} + ${args.delta}`,
      })
      .where(eq(zeroentropyCollection.id, args.collectionId));
    return ok(undefined);
  } catch (e) {
    log.error('Failed to increment document count', e, args);
    return err(unknown('Failed to increment document count'));
  }
}

export async function getCollectionById(
  collectionId: string,
): Promise<Result<CollectionInfo, AppError>> {
  try {
    const [row] = await db
      .select()
      .from(zeroentropyCollection)
      .where(eq(zeroentropyCollection.id, collectionId))
      .limit(1);
    if (!row) return err(notFound('Collection not found', 'collection'));
    return ok(rowToInfo(row));
  } catch (e) {
    log.error('Failed to fetch collection by id', e, { collectionId });
    return err(unknown('Failed to fetch collection'));
  }
}

export async function claimCollectionCreation(args: {
  organizationId: string;
  collectionName: string;
}): Promise<Result<CollectionInfo | null, AppError>> {
  try {
    const existingActive = await db.transaction(async (tx) => {
      const lockKey = `ze:collection:${args.organizationId}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

      const rows = await tx
        .select()
        .from(zeroentropyCollection)
        .where(eq(zeroentropyCollection.organizationId, args.organizationId))
        .limit(1);
      const existing = rows[0];
      if (existing && existing.status === CollectionStatus.ACTIVE) {
        return rowToInfo(existing);
      }

      if (!existing) {
        const inserted = await tx
          .insert(zeroentropyCollection)
          .values({
            organizationId: args.organizationId,
            collectionName: args.collectionName,
            status: CollectionStatus.CREATING,
          })
          .returning();
        if (!inserted[0]) {
          throw new Error('Failed to insert collection placeholder');
        }
      } else {
        await tx
          .update(zeroentropyCollection)
          .set({
            status: CollectionStatus.CREATING,
            collectionName: args.collectionName,
          })
          .where(eq(zeroentropyCollection.id, existing.id));
      }
      return null;
    });
    return ok(existingActive);
  } catch (e) {
    log.error('claimCollectionCreation transaction failed', e, {
      organizationId: args.organizationId,
    });
    return err(unknown('Failed to acquire collection lock'));
  }
}
