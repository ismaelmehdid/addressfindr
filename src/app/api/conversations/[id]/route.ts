import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { deleteConversation } from '@/application/conversation/delete-conversation';
import { renameConversation } from '@/application/conversation/rename-conversation';
import { LAST_CONVERSATION_COOKIE } from '@/core/conversation/cookies';
import { parseJsonBody, requireAuthedRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

const PatchBodySchema = v.object({ title: v.string() });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const auth = await requireAuthedRoute({
    rateLimit: 'default',
    event: 'api.conversations.rename',
  });
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, PatchBodySchema);
  if (!body.ok) return body.response;

  log.info('api.conversations.rename.request', {
    userId: auth.ctx.userId,
    threadId: id,
  });

  const result = await renameConversation({
    threadId: id,
    title: body.value.title,
  });
  if (result.isErr()) {
    log.warn('api.conversations.rename.failure', {
      code: result.error.code,
      message: result.error.message,
      userId: auth.ctx.userId,
      threadId: id,
    });
    return jsonError(result.error);
  }

  log.info('api.conversations.rename.success', {
    userId: auth.ctx.userId,
    threadId: id,
  });
  return NextResponse.json(result.value);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const auth = await requireAuthedRoute({
    rateLimit: 'default',
    event: 'api.conversations.delete',
  });
  if (!auth.ok) return auth.response;

  log.info('api.conversations.delete.request', {
    userId: auth.ctx.userId,
    threadId: id,
  });

  const result = await deleteConversation(id);
  if (result.isErr()) {
    log.warn('api.conversations.delete.failure', {
      code: result.error.code,
      message: result.error.message,
      userId: auth.ctx.userId,
      threadId: id,
    });
    return jsonError(result.error);
  }

  const store = await cookies();
  if (store.get(LAST_CONVERSATION_COOKIE)?.value === id) {
    store.delete(LAST_CONVERSATION_COOKIE);
  }

  log.info('api.conversations.delete.success', {
    userId: auth.ctx.userId,
    threadId: id,
  });
  return new Response(null, { status: 204 });
}
