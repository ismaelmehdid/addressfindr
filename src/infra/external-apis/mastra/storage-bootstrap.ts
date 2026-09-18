import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { type AppError, unknown } from '@/core/errors';
import { log } from '@/shared/logger';
import { mastraStorage } from './instance';

export type MessageStore = NonNullable<typeof mastraStorage.stores.memory>;

let storePromise: Promise<Result<MessageStore, AppError>> | null = null;

export function getMastraMessageStore(): Promise<
  Result<MessageStore, AppError>
> {
  if (storePromise) return storePromise;
  const promise = (async (): Promise<Result<MessageStore, AppError>> => {
    try {
      await mastraStorage.init();
      const store = mastraStorage.stores.memory;
      if (!store) {
        return err(unknown('Mastra memory storage not configured'));
      }
      return ok(store);
    } catch (e) {
      log.error('mastra.storage.init.failed', e);
      return err(unknown('Mastra storage init failed'));
    }
  })();
  storePromise = promise;
  promise.then((result) => {
    if (result.isErr()) storePromise = null;
  });
  return promise;
}
