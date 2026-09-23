import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { resolveCommune } from '@/application/commune/resolve-commune';
import { buildDpeSearch } from '@/core/ademe/build-search';
import type { IDpeDirectory } from '@/core/ademe/ports/dpe-directory.port';
import { rankCandidates } from '@/core/ademe/score-candidates';
import type { AddressMatch } from '@/core/ademe/types';
import { type AppError, parseInput, validation } from '@/core/errors';
import { ademeDpeDirectory } from '@/infra/external-apis/ademe/ademe-dpe-directory';
import { log } from '@/shared/logger';
import {
  type FindAddressCandidatesInput,
  FindAddressCandidatesInputSchema,
} from './dto';

const REFUSAL_MESSAGE = {
  'no-commune': 'Could not resolve the listing commune to an INSEE code',
  'no-surface': 'The listing does not state a usable surface',
} as const;

export async function findAddressCandidates(
  input: FindAddressCandidatesInput,
  deps: {
    dpeDirectory?: IDpeDirectory;
    resolveCommune?: typeof resolveCommune;
  } = {},
): Promise<Result<AddressMatch, AppError>> {
  const parsed = parseInput(
    FindAddressCandidatesInputSchema,
    input,
    'Invalid match input',
  );
  if (parsed.isErr()) return err(parsed.error);

  const { fields } = parsed.value.listing;

  log.info('ademe.match.start', { portal: fields.portal });

  const commune = await (deps.resolveCommune ?? resolveCommune)({
    inseeCode: fields.inseeCode,
    postalCode: fields.postalCode,
    city: fields.city,
  });
  if (commune.isErr()) return err(commune.error);

  const inseeCode =
    commune.value.kind === 'resolved' ? commune.value.commune.inseeCode : null;

  const search = buildDpeSearch({ inseeCode, values: fields });
  if (!search.ok) {
    log.warn('ademe.match.refused', {
      portal: fields.portal,
      reason: search.reason,
      communeKind: commune.value.kind,
    });
    return err(validation(REFUSAL_MESSAGE[search.reason], 'listing'));
  }

  const directory = deps.dpeDirectory ?? ademeDpeDirectory;
  const found = await directory.search(search.filter);
  if (found.isErr()) return err(found.error);

  const match = rankCandidates({
    values: fields,
    records: found.value.records,
    truncated: found.value.total > search.filter.limit,
  });

  log.info('ademe.match.success', {
    portal: fields.portal,
    inseeCode: search.filter.inseeCode,
    inspected: match.inspected,
    returned: match.candidates.length,
    truncated: match.truncated,
    refusedFor: match.refusedFor,
    best: match.candidates[0]?.confidence ?? 0,
  });

  return ok(match);
}
