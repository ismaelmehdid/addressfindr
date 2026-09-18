import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { loadConversation } from '@/application/conversation/load-conversation';
import {
  LAST_CONVERSATION_COOKIE,
  LAST_CONVERSATION_COOKIE_MAX_AGE,
} from '@/core/conversation/cookies';
import { requireAuthedRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const auth = await requireAuthedRoute({
    rateLimit: 'default',
    event: 'api.conversations.activate',
  });
  if (!auth.ok) return auth.response;

  log.info('api.conversations.activate.request', {
    userId: auth.ctx.userId,
    threadId: id,
  });

  const result = await loadConversation(id);
  if (result.isErr()) {
    log.warn('api.conversations.activate.failure', {
      code: result.error.code,
      message: result.error.message,
      userId: auth.ctx.userId,
      threadId: id,
    });
    return jsonError(result.error);
  }

  const store = await cookies();
  store.set(LAST_CONVERSATION_COOKIE, id, {
    path: '/',
    maxAge: LAST_CONVERSATION_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
  });

  log.info('api.conversations.activate.success', {
    userId: auth.ctx.userId,
    threadId: id,
    count: result.value.messages.length,
  });
  return NextResponse.json(result.value);
}
