import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { listFiles } from '@/application/files/list-files';
import { validation } from '@/core/errors';
import { requireAuthedRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

const QuerySchema = v.object({
  page: v.pipe(
    v.string(),
    v.transform((s) => Number(s)),
    v.integer(),
    v.minValue(0),
    v.maxValue(10000),
  ),
});

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAuthedRoute({
    rateLimit: 'default',
    event: 'api.files.list',
  });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsedQuery = v.safeParse(QuerySchema, {
    page: url.searchParams.get('page') ?? '0',
  });
  if (!parsedQuery.success) {
    return jsonError(validation('Invalid page query', 'page'));
  }
  const { page } = parsedQuery.output;

  log.info('api.files.list.request', {
    userId: auth.ctx.userId,
    page,
  });

  const result = await listFiles({ page });
  if (result.isErr()) {
    log.warn('api.files.list.failure', {
      code: result.error.code,
      message: result.error.message,
      userId: auth.ctx.userId,
    });
    return jsonError(result.error);
  }
  log.info('api.files.list.success', {
    userId: auth.ctx.userId,
    count: result.value.items.length,
    page: result.value.page,
  });
  return NextResponse.json(result.value);
}
