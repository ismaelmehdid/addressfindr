import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import type { IBuildingDirectory } from '@/core/building/ports/building-directory.port';
import type { BuildingFacts } from '@/core/building/types';
import type { AppError } from '@/core/errors';
import { bdnbBuildingDirectory } from '@/infra/external-apis/bdnb/bdnb-building-directory';
import { log } from '@/shared/logger';

export async function getBuildingFacts(
  input: { banIds: readonly string[] },
  deps: { directory?: IBuildingDirectory } = {},
): Promise<Result<BuildingFacts[], AppError>> {
  const directory = deps.directory ?? bdnbBuildingDirectory;
  const found = await directory.factsForAddresses({ banIds: input.banIds });
  if (found.isErr()) return err(found.error);

  log.info('building.facts.success', {
    asked: input.banIds.length,
    found: found.value.length,
  });
  return ok(found.value);
}
