import { NextResponse } from 'next/server';
import { FinalizeFileUploadInputSchema } from '@/application/files/dto';
import { finalizeFileUpload } from '@/application/files/finalize-upload';
import { parseJsonBody, requireAuthedRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';
import { captureServerEvent } from '@/shared/posthog-server';

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAuthedRoute({
    rateLimit: 'default',
    event: 'api.files.finalize',
  });
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, FinalizeFileUploadInputSchema);
  if (!body.ok) return body.response;

  log.info('api.files.finalize.request', {
    organizationId: auth.ctx.organizationId,
    userId: auth.ctx.userId,
    fileId: body.value.fileId,
  });

  const result = await finalizeFileUpload(body.value);
  if (result.isErr()) {
    log.warn('api.files.finalize.failure', {
      code: result.error.code,
      message: result.error.message,
      organizationId: auth.ctx.organizationId,
    });
    return jsonError(result.error);
  }
  log.info('api.files.finalize.success', {
    fileId: result.value.file.id,
    organizationId: auth.ctx.organizationId,
  });
  captureServerEvent({
    distinctId: auth.ctx.userId,
    event: 'file_uploaded',
    properties: {
      file_id: result.value.file.id,
      organization_id: auth.ctx.organizationId,
    },
  });
  return NextResponse.json(result.value);
}
