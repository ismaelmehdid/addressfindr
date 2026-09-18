import { NextResponse } from 'next/server';
import { InitiateFileUploadInputSchema } from '@/application/files/dto';
import { initiateFileUpload } from '@/application/files/initiate-upload';
import { parseJsonBody, requireAuthedRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAuthedRoute({
    rateLimit: 'upload',
    event: 'api.files.upload_url',
  });
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, InitiateFileUploadInputSchema);
  if (!body.ok) return body.response;

  log.info('api.files.upload_url.request', {
    userId: auth.ctx.userId,
    mimeType: body.value.mimeType,
  });

  const result = await initiateFileUpload(body.value);
  if (result.isErr()) {
    log.warn('api.files.upload_url.failure', {
      code: result.error.code,
      message: result.error.message,
      userId: auth.ctx.userId,
    });
    return jsonError(result.error);
  }
  log.info('api.files.upload_url.success', {
    fileId: result.value.fileId,
    userId: auth.ctx.userId,
  });
  return NextResponse.json(result.value);
}
