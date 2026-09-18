import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { loadOlderMessages } from '@/application/conversation/load-older-messages';
import { validation } from '@/core/errors';
import { requireAuthedRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

const CursorSchema = v.object({
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  id: v.pipe(v.string(), v.minLength(1)),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const auth = await requireAuthedRoute({
    rateLimit: 'default',
    event: 'api.conversations.load_older',
  });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = v.safeParse(CursorSchema, {
    createdAt: url.searchParams.get('beforeCreatedAt'),
    id: url.searchParams.get('beforeId'),
  });
  if (!parsed.success) {
    return jsonError(validation('Invalid cursor query', 'beforeCreatedAt'));
  }

  log.info('api.conversations.load_older.request', {
    userId: auth.ctx.userId,
    threadId: id,
  });

  const result = await loadOlderMessages({
    threadId: id,
    before: parsed.output,
  });
  if (result.isErr()) {
    log.warn('api.conversations.load_older.failure', {
      code: result.error.code,
      message: result.error.message,
      userId: auth.ctx.userId,
      threadId: id,
    });
    return jsonError(result.error);
  }

  log.info('api.conversations.load_older.success', {
    userId: auth.ctx.userId,
    threadId: id,
    count: result.value.messages.length,
  });
  return NextResponse.json(result.value);
}
