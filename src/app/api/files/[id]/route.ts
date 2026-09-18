import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { deleteFile } from '@/application/files/delete-file';
import { RenameFileInputSchema } from '@/application/files/dto';
import { getFileDownloadUrl } from '@/application/files/get-download-url';
import { renameFile } from '@/application/files/rename-file';
import { validation } from '@/core/errors';
import { parseJsonBody, requireAuthedRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

const PatchBodySchema = v.object({ originalName: v.unknown() });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const auth = await requireAuthedRoute({
    rateLimit: 'default',
    event: 'api.files.download_url',
  });
  if (!auth.ok) return auth.response;

  log.info('api.files.download_url.request', {
    organizationId: auth.ctx.organizationId,
    userId: auth.ctx.userId,
    fileId: id,
  });

  const result = await getFileDownloadUrl(id);
  if (result.isErr()) {
    log.warn('api.files.download_url.failure', {
      code: result.error.code,
      message: result.error.message,
      organizationId: auth.ctx.organizationId,
      fileId: id,
    });
    return jsonError(result.error);
  }
  log.info('api.files.download_url.success', {
    organizationId: auth.ctx.organizationId,
    fileId: id,
  });
  return NextResponse.json(result.value);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const auth = await requireAuthedRoute({
    rateLimit: 'default',
    event: 'api.files.rename',
  });
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(req, PatchBodySchema);
  if (!body.ok) return body.response;

  const parsed = v.safeParse(RenameFileInputSchema, {
    fileId: id,
    originalName: body.value.originalName,
  });
  if (!parsed.success) {
    return jsonError(
      validation(parsed.issues[0]?.message ?? 'Invalid rename input', 'name'),
    );
  }

  log.info('api.files.rename.request', {
    organizationId: auth.ctx.organizationId,
    userId: auth.ctx.userId,
    fileId: id,
  });

  const result = await renameFile(parsed.output);
  if (result.isErr()) {
    log.warn('api.files.rename.failure', {
      code: result.error.code,
      message: result.error.message,
      organizationId: auth.ctx.organizationId,
      fileId: id,
    });
    return jsonError(result.error);
  }
  log.info('api.files.rename.success', {
    fileId: result.value.id,
    organizationId: auth.ctx.organizationId,
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
    event: 'api.files.delete',
  });
  if (!auth.ok) return auth.response;

  log.info('api.files.delete.request', {
    organizationId: auth.ctx.organizationId,
    userId: auth.ctx.userId,
    fileId: id,
  });

  const result = await deleteFile(id);
  if (result.isErr()) {
    log.warn('api.files.delete.failure', {
      code: result.error.code,
      message: result.error.message,
      organizationId: auth.ctx.organizationId,
      fileId: id,
    });
    return jsonError(result.error);
  }
  log.info('api.files.delete.success', {
    fileId: id,
    organizationId: auth.ctx.organizationId,
  });
  return new Response(null, { status: 204 });
}
