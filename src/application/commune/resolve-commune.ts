import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import type { ICommuneDirectory } from '@/core/commune/ports/commune-directory.port';
import { selectCommune } from '@/core/commune/select-commune';
import { type CommuneResolution, isInseeCode } from '@/core/commune/types';
import { type AppError, parseInput } from '@/core/errors';
import { geoGouvCommuneDirectory } from '@/infra/external-apis/geo-gouv/geo-gouv-commune-directory';
import { log } from '@/shared/logger';
import { type ResolveCommuneInput, ResolveCommuneInputSchema } from './dto';

export async function resolveCommune(
  input: ResolveCommuneInput,
  deps: { directory?: ICommuneDirectory } = {},
): Promise<Result<CommuneResolution, AppError>> {
  const parsed = parseInput(
    ResolveCommuneInputSchema,
    input,
    'Invalid commune input',
  );
  if (parsed.isErr()) return err(parsed.error);

  const { inseeCode, postalCode, city } = parsed.value;
  const directory = deps.directory ?? geoGouvCommuneDirectory;

  log.info('commune.resolve.start', {
    hasInsee: inseeCode !== null,
    hasPostalCode: postalCode !== null,
  });

  if (inseeCode !== null && isInseeCode(inseeCode)) {
    const found = await directory.findByInseeCode({
      inseeCode: inseeCode.toUpperCase(),
    });
    if (found.isErr()) return err(found.error);
    if (found.value !== null) {
      log.info('commune.resolve.success', { via: 'insee-code' });
      return ok({ kind: 'resolved', commune: found.value });
    }
  }

  if (postalCode === null) {
    log.info('commune.resolve.unresolved', { reason: 'no-postal-code' });
    return ok({ kind: 'unresolved' });
  }

  const candidates = await directory.findByPostalCode({ postalCode });
  if (candidates.isErr()) return err(candidates.error);

  const resolution = selectCommune({ candidates: candidates.value, city });
  log.info('commune.resolve.done', {
    via: 'postal-code',
    kind: resolution.kind,
    candidates: candidates.value.length,
  });
  return ok(resolution);
}
