import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/infra/data-access/zeroentropy/failed-sync-repo', () => ({
  enqueueOperation: vi.fn(),
  pickDueOperations: vi.fn(),
  recordAttemptFailure: vi.fn(),
  deleteByEventId: vi.fn(),
}));

vi.mock('./sinks/zeroentropy-sink', () => ({
  zeroEntropySink: { name: 'mock-sink', handle: vi.fn() },
}));

import { unknown as unknownErr } from '@/core/errors';
import {
  DataSource,
  IndexableEntityType,
  SyncOperation,
} from '@/core/zeroentropy/types';
import {
  deleteByEventId,
  enqueueOperation,
  pickDueOperations,
  recordAttemptFailure,
} from '@/infra/data-access/zeroentropy/failed-sync-repo';
import { dispatchEvent, retryDueOperations } from './entity-sync-orchestrator';
import { zeroEntropySink } from './sinks/zeroentropy-sink';

const mockedEnqueue = vi.mocked(enqueueOperation);
const mockedPick = vi.mocked(pickDueOperations);
const mockedRecord = vi.mocked(recordAttemptFailure);
const mockedDelete = vi.mocked(deleteByEventId);
const mockedHandle = vi.mocked(zeroEntropySink.handle);

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt-1',
    operation: SyncOperation.UPDATE,
    entityType: IndexableEntityType.FILE,
    entityId: 'file-1',
    userId: 'user-1',
    source: DataSource.USER_EDIT,
    timestamp: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedEnqueue.mockResolvedValue(ok(undefined));
  mockedDelete.mockResolvedValue(ok(undefined));
  mockedRecord.mockResolvedValue(ok(undefined));
});

describe('dispatchEvent', () => {
  it('enqueues then runs sinks then deletes on success', async () => {
    mockedHandle.mockResolvedValue(ok(undefined));
    const r = await dispatchEvent(event());
    expect(r.isOk()).toBe(true);
    expect(mockedEnqueue).toHaveBeenCalledOnce();
    expect(mockedHandle).toHaveBeenCalledOnce();
    expect(mockedDelete).toHaveBeenCalledWith('evt-1');
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it('returns enqueue errors without invoking sink', async () => {
    mockedEnqueue.mockResolvedValue(err(unknownErr('db down')));
    const r = await dispatchEvent(event());
    expect(r.isErr()).toBe(true);
    expect(mockedHandle).not.toHaveBeenCalled();
  });

  it('records failure and returns error when sink fails', async () => {
    mockedHandle.mockResolvedValue(err(unknownErr('upstream 500')));
    const r = await dispatchEvent(event());
    expect(r.isErr()).toBe(true);
    expect(mockedRecord).toHaveBeenCalledOnce();
    const call = mockedRecord.mock.calls[0]?.[0];
    expect(call?.eventId).toBe('evt-1');
    expect(call?.isPermanentlyFailed).toBe(false);
    expect(call?.lastError).toContain('upstream 500');
    expect(mockedDelete).not.toHaveBeenCalled();
  });
});

describe('retryDueOperations', () => {
  it('returns 0 attempted when no operations are due', async () => {
    mockedPick.mockResolvedValue(ok([]));
    const r = await retryDueOperations({ limit: 5 });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value).toEqual({ attempted: 0, succeeded: 0 });
    expect(mockedHandle).not.toHaveBeenCalled();
  });

  it('returns pickDueOperations errors verbatim', async () => {
    mockedPick.mockResolvedValue(err(unknownErr('db')));
    const r = await retryDueOperations({ limit: 5 });
    expect(r.isErr()).toBe(true);
  });

  it('clears each successfully-retried operation', async () => {
    mockedPick.mockResolvedValue(
      ok([
        {
          eventId: 'a',
          attempts: 0,
          nextRetryAt: new Date(),
          operation: SyncOperation.UPDATE,
          entityType: IndexableEntityType.FILE,
          entityId: 'f',
          userId: 'u',
          source: DataSource.RETRY,
        } as never,
        {
          eventId: 'b',
          attempts: 1,
          nextRetryAt: new Date(),
          operation: SyncOperation.UPDATE,
          entityType: IndexableEntityType.FILE,
          entityId: 'f',
          userId: 'u',
          source: DataSource.RETRY,
        } as never,
      ]),
    );
    mockedHandle.mockResolvedValue(ok(undefined));
    const r = await retryDueOperations({ limit: 5 });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value).toEqual({ attempted: 2, succeeded: 2 });
    expect(mockedDelete).toHaveBeenCalledTimes(2);
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it('records failure with isPermanentlyFailed=false when attempts below cap', async () => {
    mockedPick.mockResolvedValue(
      ok([
        {
          eventId: 'a',
          attempts: 0,
          nextRetryAt: new Date(),
          operation: SyncOperation.UPDATE,
          entityType: IndexableEntityType.FILE,
          entityId: 'f',
          userId: 'u',
          source: DataSource.RETRY,
        } as never,
      ]),
    );
    mockedHandle.mockResolvedValue(err(unknownErr('transient')));
    const r = await retryDueOperations({ limit: 5 });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value).toEqual({ attempted: 1, succeeded: 0 });
    expect(mockedRecord).toHaveBeenCalledOnce();
    expect(mockedRecord.mock.calls[0]?.[0]?.isPermanentlyFailed).toBe(false);
  });

  it('marks permanently failed once attempts reach the cap', async () => {
    mockedPick.mockResolvedValue(
      ok([
        {
          eventId: 'doomed',
          attempts: 9, // ZE config cap is 10, so 9 + 1 = 10 → permanent
          nextRetryAt: new Date(),
          operation: SyncOperation.UPDATE,
          entityType: IndexableEntityType.FILE,
          entityId: 'f',
          userId: 'u',
          source: DataSource.RETRY,
        } as never,
      ]),
    );
    mockedHandle.mockResolvedValue(err(unknownErr('final')));
    await retryDueOperations({ limit: 5 });
    expect(mockedRecord.mock.calls[0]?.[0]?.isPermanentlyFailed).toBe(true);
  });
});
