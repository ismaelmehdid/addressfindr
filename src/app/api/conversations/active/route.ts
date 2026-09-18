import { cookies } from 'next/headers';
import { LAST_CONVERSATION_COOKIE } from '@/core/conversation/cookies';
import { requireAuthedRoute } from '@/shared/api-route';
import { log } from '@/shared/logger';

export async function DELETE(): Promise<Response> {
  const auth = await requireAuthedRoute({
    rateLimit: 'default',
    event: 'api.conversations.clear_active',
  });
  if (!auth.ok) return auth.response;

  const store = await cookies();
  store.delete(LAST_CONVERSATION_COOKIE);

  log.info('api.conversations.clear_active.success', {
    userId: auth.ctx.userId,
  });
  return new Response(null, { status: 204 });
}
