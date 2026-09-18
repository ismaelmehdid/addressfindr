import { NextResponse } from 'next/server';
import { BulkDownloadUrlsInputSchema } from '@/application/files/dto';
import { getBulkDownloadUrls } from '@/application/files/get-download-urls-bulk';
import { parseJsonBody, requireAuthedRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAuthedRoute({
    rateLimit: 'default',
    event: 'api.files.download_urls',
  });
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, BulkDownloadUrlsInputSchema);
  if (!body.ok) return body.response;

  log.info('api.files.download_urls.request', {
    organizationId: auth.ctx.organizationId,
    userId: auth.ctx.userId,
    count: body.value.ids.length,
  });

  const result = await getBulkDownloadUrls(body.value);
  if (result.isErr()) {
    log.warn('api.files.download_urls.failure', {
      code: result.error.code,
      message: result.error.message,
      organizationId: auth.ctx.organizationId,
    });
    return jsonError(result.error);
  }
  log.info('api.files.download_urls.success', {
    organizationId: auth.ctx.organizationId,
    count: Object.keys(result.value.urls).length,
  });
  return NextResponse.json(result.value);
}
