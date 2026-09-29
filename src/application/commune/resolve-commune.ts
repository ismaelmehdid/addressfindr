import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import type { ICommuneDirectory } from '@/core/commune/ports/commune-directory.port';
import { selectCommune } from '@/core/commune/select-commune';
import {
  type Commune,
  type CommuneResolution,
  isInseeCode,
} from '@/core/commune/types';
import { type AppError, parseInput } from '@/core/errors';
import { geoGouvCommuneDirectory } from '@/infra/external-apis/geo-gouv/geo-gouv-commune-directory';
import { log } from '@/shared/logger';
import {
  type InseeCodeOrigin,
  type ResolveCommuneInput,
  ResolveCommuneInputSchema,
} from './dto';

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

  const { inseeCode, inseeCodeOrigin, postalCode, city } = parsed.value;
  const directory = deps.directory ?? geoGouvCommuneDirectory;

  log.info('commune.resolve.start', {
    hasInsee: inseeCode !== null,
    inseeCodeOrigin,
    hasPostalCode: postalCode !== null,
  });

  const byInseeCode = await communeOfInseeCode({
    directory,
    inseeCode,
    origin: inseeCodeOrigin,
    postalCode,
  });
  if (byInseeCode.isErr()) return err(byInseeCode.error);
  if (byInseeCode.value !== null) {
    log.info('commune.resolve.success', {
      via: 'insee-code',
      inseeCodeOrigin,
    });
    return ok({ kind: 'resolved', commune: byInseeCode.value });
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

// why: a model asked for the INSEE code may quote a postal code, and 69003 is
// both Lyon 3e's postal code and Albigny-sur-Saône's INSEE code. A quoted code
// is kept only when its commune contains the listing's postal code.
async function communeOfInseeCode(input: {
  directory: ICommuneDirectory;
  inseeCode: string | null;
  origin: InseeCodeOrigin;
  postalCode: string | null;
}): Promise<Result<Commune | null, AppError>> {
  const { inseeCode, origin, postalCode } = input;
  if (inseeCode === null || !isInseeCode(inseeCode)) return ok(null);
  if (origin === 'quoted' && postalCode === null) {
    log.info('commune.resolve.insee_ignored', { reason: 'no-postal-code' });
    return ok(null);
  }

  const found = await input.directory.findByInseeCode({
    inseeCode: inseeCode.toUpperCase(),
  });
  if (found.isErr() || found.value === null) return found;

  const confirmed =
    origin === 'structured' ||
    (postalCode !== null && found.value.postalCodes.includes(postalCode));
  if (!confirmed) {
    log.info('commune.resolve.insee_ignored', {
      reason: 'postal-code-mismatch',
      inseeCode: found.value.inseeCode,
      postalCode,
    });
    return ok(null);
  }
  return found;
}
