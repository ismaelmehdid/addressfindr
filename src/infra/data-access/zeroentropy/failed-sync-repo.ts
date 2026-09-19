import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import { type AppError, unknown } from '@/core/errors';
import type {
  DataSource,
  IndexableEntityType,
  SyncOperation,
} from '@/core/zeroentropy/types';
import { db } from '@/infra/database/connection';
import { failedSyncOperation } from '@/infra/database/schema/zeroentropy-schema';
import { log } from '@/shared/logger';

export type FailedSyncOperationRecord = {
  id: string;
  eventId: string;
  userId: string;
  entityType: IndexableEntityType;
  entityId: string;
  operation: SyncOperation;
  source: DataSource;
  attempts: number;
  lastError: string | null;
  isPermanentlyFailed: boolean;
  nextRetryAt: Date;
  lastAttemptAt: Date | null;
  payload: string | null;
};

export async function enqueueOperation(args: {
  eventId: string;
  userId: string;
  entityType: IndexableEntityType;
  entityId: string;
  operation: SyncOperation;
  source: DataSource;
  payload?: string;
}): Promise<Result<void, AppError>> {
  try {
    await db
      .insert(failedSyncOperation)
      .values({
        eventId: args.eventId,
        userId: args.userId,
        entityType: args.entityType,
        entityId: args.entityId,
        operation: args.operation,
        source: args.source,
        attempts: 0,
        nextRetryAt: new Date(),
        payload: args.payload ?? null,
      })
      .onConflictDoUpdate({
        target: [
          failedSyncOperation.userId,
          failedSyncOperation.entityType,
          failedSyncOperation.entityId,
        ],
        set: {
          eventId: sql`CASE
            WHEN ${failedSyncOperation.createdAt} < EXCLUDED.created_at
            THEN EXCLUDED.event_id
            ELSE ${failedSyncOperation.eventId}
          END`,
          operation: sql`CASE
            WHEN ${failedSyncOperation.createdAt} < EXCLUDED.created_at
            THEN EXCLUDED.operation
            ELSE ${failedSyncOperation.operation}
          END`,
          source: sql`CASE
            WHEN ${failedSyncOperation.createdAt} < EXCLUDED.created_at
            THEN EXCLUDED.source
            ELSE ${failedSyncOperation.source}
          END`,
          payload: sql`CASE
            WHEN ${failedSyncOperation.createdAt} < EXCLUDED.created_at
            THEN EXCLUDED.payload
            ELSE ${failedSyncOperation.payload}
          END`,
          attempts: sql`CASE
            WHEN ${failedSyncOperation.createdAt} < EXCLUDED.created_at
            THEN 0
            ELSE ${failedSyncOperation.attempts}
          END`,
          nextRetryAt: sql`CASE
            WHEN ${failedSyncOperation.createdAt} < EXCLUDED.created_at
            THEN NOW()
            ELSE ${failedSyncOperation.nextRetryAt}
          END`,
          isPermanentlyFailed: sql`CASE
            WHEN ${failedSyncOperation.createdAt} < EXCLUDED.created_at
            THEN false
            ELSE ${failedSyncOperation.isPermanentlyFailed}
          END`,
        },
      });
    return ok(undefined);
  } catch (e) {
    log.error('Failed to enqueue sync operation', e, { eventId: args.eventId });
    return err(unknown('Failed to enqueue sync operation'));
  }
}

export async function deleteByEventId(
  eventId: string,
): Promise<Result<void, AppError>> {
  try {
    await db
      .delete(failedSyncOperation)
      .where(eq(failedSyncOperation.eventId, eventId));
    return ok(undefined);
  } catch (e) {
    log.error('Failed to delete failed-sync row', e, { eventId });
    return err(unknown('Failed to delete failed-sync row'));
  }
}

export async function recordAttemptFailure(args: {
  eventId: string;
  lastError: string;
  nextRetryAt: Date;
  isPermanentlyFailed: boolean;
}): Promise<Result<void, AppError>> {
  try {
    await db
      .update(failedSyncOperation)
      .set({
        attempts: sql`${failedSyncOperation.attempts} + 1`,
        lastError: args.lastError,
        lastAttemptAt: new Date(),
        nextRetryAt: args.nextRetryAt,
        isPermanentlyFailed: args.isPermanentlyFailed,
      })
      .where(eq(failedSyncOperation.eventId, args.eventId));
    return ok(undefined);
  } catch (e) {
    log.error('Failed to record attempt failure', e, args);
    return err(unknown('Failed to record attempt failure'));
  }
}

export async function pickDueOperations(args: {
  limit: number;
  leaseMs: number;
}): Promise<Result<FailedSyncOperationRecord[], AppError>> {
  try {
    const leaseUntil = new Date(Date.now() + args.leaseMs).toISOString();
    const rows = await db.execute<Record<string, unknown>>(sql`
      UPDATE ${failedSyncOperation}
      SET next_retry_at = ${leaseUntil}, last_attempt_at = NOW(), updated_at = NOW()
      WHERE id IN (
        SELECT id FROM ${failedSyncOperation}
        WHERE is_permanently_failed = false
          AND next_retry_at <= NOW()
        ORDER BY next_retry_at
        LIMIT ${args.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    const records: FailedSyncOperationRecord[] = [];
    for (const raw of rows) {
      const parsed = parseRawFailedSyncRow(raw);
      if (parsed.isErr()) return err(parsed.error);
      records.push(parsed.value);
    }
    return ok(records);
  } catch (e) {
    log.error('Failed to pick due failed-sync operations', e, args);
    return err(unknown('Failed to pick due failed-sync operations'));
  }
}

function parseRawFailedSyncRow(
  raw: unknown,
): Result<FailedSyncOperationRecord, AppError> {
  if (typeof raw !== 'object' || raw === null) {
    return err(unknown('Invalid failed_sync_operation row shape'));
  }
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : null;
  const eventId = typeof r.event_id === 'string' ? r.event_id : null;
  const userId = typeof r.user_id === 'string' ? r.user_id : null;
  const entityType = typeof r.entity_type === 'string' ? r.entity_type : null;
  const entityId = typeof r.entity_id === 'string' ? r.entity_id : null;
  const operation = typeof r.operation === 'string' ? r.operation : null;
  const source = typeof r.source === 'string' ? r.source : null;
  const attempts = typeof r.attempts === 'number' ? r.attempts : null;
  const lastError =
    r.last_error === null || typeof r.last_error === 'string'
      ? (r.last_error as string | null)
      : null;
  const isPermanentlyFailed = Boolean(r.is_permanently_failed);
  const nextRetryAtRaw = r.next_retry_at;
  const lastAttemptAtRaw = r.last_attempt_at;
  const payload =
    r.payload === null || typeof r.payload === 'string'
      ? (r.payload as string | null)
      : null;
  if (
    !id ||
    !eventId ||
    !userId ||
    !entityType ||
    !entityId ||
    !operation ||
    !source ||
    attempts === null
  ) {
    return err(unknown('Invalid failed_sync_operation row shape'));
  }
  const nextRetryAt =
    nextRetryAtRaw instanceof Date
      ? nextRetryAtRaw
      : typeof nextRetryAtRaw === 'string'
        ? new Date(nextRetryAtRaw)
        : null;
  if (!nextRetryAt) {
    return err(unknown('Invalid next_retry_at in failed_sync_operation row'));
  }
  const lastAttemptAt =
    lastAttemptAtRaw instanceof Date
      ? lastAttemptAtRaw
      : typeof lastAttemptAtRaw === 'string'
        ? new Date(lastAttemptAtRaw)
        : null;
  return ok({
    id,
    eventId,
    userId,
    entityType: entityType as IndexableEntityType,
    entityId,
    operation: operation as SyncOperation,
    source: source as DataSource,
    attempts,
    lastError,
    isPermanentlyFailed,
    nextRetryAt,
    lastAttemptAt,
    payload,
  });
}
