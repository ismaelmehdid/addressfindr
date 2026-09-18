import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import pLimit from 'p-limit';
import type { AppError } from '@/core/errors';
import { ZEROENTROPY_CONFIG } from '@/core/zeroentropy/config';
import type { ISyncSink } from '@/core/zeroentropy/ports/sync-sink.port';
import type { EntityChangeEvent } from '@/core/zeroentropy/types';
import {
  deleteByEventId,
  enqueueOperation,
  pickDueOperations,
  recordAttemptFailure,
} from '@/infra/data-access/zeroentropy/failed-sync-repo';
import { log } from '@/shared/logger';
import { zeroEntropySink } from './sinks/zeroentropy-sink';

const SINKS: ISyncSink[] = [zeroEntropySink];
const ORCHESTRATOR_CONCURRENCY = 5;
const orchestratorLimit = pLimit(ORCHESTRATOR_CONCURRENCY);

function nextRetryDelay(attempts: number): number {
  const exp =
    ZEROENTROPY_CONFIG.failedSyncBaseDelayMs * 2 ** Math.min(attempts, 12);
  return Math.min(exp, ZEROENTROPY_CONFIG.failedSyncMaxDelayMs);
}

async function runSinks(
  event: EntityChangeEvent,
): Promise<Result<void, AppError>> {
  for (const sink of SINKS) {
    const res = await sink.handle(event);
    if (res.isErr()) {
      log.warn('Sync sink reported failure', {
        sink: sink.name,
        eventId: event.eventId,
        error: res.error,
      });
      return err(res.error);
    }
  }
  return ok(undefined);
}

export async function dispatchEvent(
  event: EntityChangeEvent,
): Promise<Result<void, AppError>> {
  const queued = await enqueueOperation({
    eventId: event.eventId,
    userId: event.userId,
    entityType: event.entityType,
    entityId: event.entityId,
    operation: event.operation,
    source: event.source,
  });
  if (queued.isErr()) return err(queued.error);

  const handled = await orchestratorLimit(() => runSinks(event));
  if (handled.isErr()) {
    await recordAttemptFailure({
      eventId: event.eventId,
      lastError: handled.error.message,
      nextRetryAt: new Date(Date.now() + nextRetryDelay(0)),
      isPermanentlyFailed: false,
    });
    return err(handled.error);
  }

  return deleteByEventId(event.eventId);
}

export async function retryDueOperations(args: {
  limit: number;
}): Promise<Result<{ attempted: number; succeeded: number }, AppError>> {
  const due = await pickDueOperations({
    limit: args.limit,
    leaseMs: 5 * 60 * 1000,
  });
  if (due.isErr()) return err(due.error);

  let succeeded = 0;
  const tasks = due.value.map((op) =>
    orchestratorLimit(async () => {
      const event: EntityChangeEvent = {
        eventId: op.eventId,
        operation: op.operation,
        entityType: op.entityType,
        entityId: op.entityId,
        userId: op.userId,
        source: op.source,
        timestamp: op.nextRetryAt,
      };
      const handled = await runSinks(event);
      if (handled.isOk()) {
        const cleared = await deleteByEventId(op.eventId);
        if (cleared.isOk()) succeeded += 1;
        return;
      }
      const nextAttempts = op.attempts + 1;
      const isPermanent =
        nextAttempts >= ZEROENTROPY_CONFIG.failedSyncMaxAttempts;
      await recordAttemptFailure({
        eventId: op.eventId,
        lastError: handled.error.message,
        nextRetryAt: new Date(Date.now() + nextRetryDelay(nextAttempts)),
        isPermanentlyFailed: isPermanent,
      });
      if (isPermanent) {
        log.error(
          'Sync operation permanently failed',
          new Error(handled.error.message),
          { eventId: op.eventId, attempts: nextAttempts },
        );
      }
    }),
  );
  await Promise.all(tasks);

  return ok({ attempted: due.value.length, succeeded });
}
