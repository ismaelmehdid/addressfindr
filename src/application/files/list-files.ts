import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { requireOrganizationScope } from '@/application/me/organization-scope';
import { type AppError, parseInput } from '@/core/errors';
import { listFilesForOrg } from '@/infra/data-access/file/file-repo';
import { type FileDto, ListFilesInputSchema } from './dto';
import { toFileDto } from './mappers';

export type FilePageDto = {
  items: FileDto[];
  hasMore: boolean;
  page: number;
};

export async function listFiles(input: {
  page: number;
  perPage?: number;
}): Promise<Result<FilePageDto, AppError>> {
  const parsed = parseInput(ListFilesInputSchema, input, 'Invalid list input');
  if (parsed.isErr()) return err(parsed.error);

  const scope = await requireOrganizationScope();
  if (scope.isErr()) return err(scope.error);

  const page = await listFilesForOrg({
    organizationId: scope.value.organizationId,
    page: parsed.value.page,
    perPage: parsed.value.perPage,
  });
  if (page.isErr()) return err(page.error);

  return ok({
    items: page.value.items.map(toFileDto),
    hasMore: page.value.hasMore,
    page: page.value.page,
  });
}
