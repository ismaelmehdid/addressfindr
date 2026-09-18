import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { getFile } from '@/application/files/get-file';
import { validation } from '@/core/errors';
import { requireAuthedRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';

const QuerySchema = v.object({
  kind: v.picklist(['storage-file']),
  id: v.pipe(v.string(), v.minLength(1)),
});

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAuthedRoute({
    rateLimit: 'default',
    event: 'api.chat.active_context',
  });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = v.safeParse(QuerySchema, {
    kind: url.searchParams.get('kind'),
    id: url.searchParams.get('id'),
  });
  if (!parsed.success) {
    return jsonError(validation('Invalid active-context query', 'kind'));
  }
  const { id } = parsed.output;

  const result = await getFile(id);
  if (result.isErr()) return jsonError(result.error);
  return NextResponse.json({ name: result.value.originalName });
}
