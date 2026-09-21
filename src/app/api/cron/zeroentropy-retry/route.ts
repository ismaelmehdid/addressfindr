import { NextResponse } from 'next/server';
import { retryDueOperations } from '@/application/zeroentropy/entity-sync-orchestrator';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';
import { timingSafeCompareStrings } from '@/shared/timing-safe-compare';

export const maxDuration = 60;

const BATCH_LIMIT = 50;

export async function GET(req: Request): Promise<Response> {
  const secret = env().CRON_SECRET;
  if (!secret) {
    log.warn('api.cron.zeroentropy_retry.unauthorized', {
      reason: 'cron_secret_not_configured',
    });
    return new Response('Unauthorized', { status: 401 });
  }

  const auth = req.headers.get('authorization');
  const received = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!timingSafeCompareStrings(received, secret)) {
    log.warn('api.cron.zeroentropy_retry.unauthorized', {
      reason: 'bad_secret',
    });
    return new Response('Unauthorized', { status: 401 });
  }

  log.info('api.cron.zeroentropy_retry.request', { limit: BATCH_LIMIT });

  const result = await retryDueOperations({ limit: BATCH_LIMIT });
  if (result.isErr()) {
    log.error(
      'api.cron.zeroentropy_retry.failure',
      new Error(result.error.message),
      { code: result.error.code },
    );
    return NextResponse.json(
      { error: result.error.code, message: result.error.message },
      { status: 500 },
    );
  }
  log.info('api.cron.zeroentropy_retry.success', result.value);
  return NextResponse.json(result.value);
}
