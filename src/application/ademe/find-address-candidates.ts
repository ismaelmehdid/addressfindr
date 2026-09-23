import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { getBuildingFacts } from '@/application/building/get-building-facts';
import { resolveCommune } from '@/application/commune/resolve-commune';
import { buildDpeSearch } from '@/core/ademe/build-search';
import { enrichRecords } from '@/core/ademe/enrich-records';
import type { IDpeDirectory } from '@/core/ademe/ports/dpe-directory.port';
import type { IParcelDirectory } from '@/core/ademe/ports/parcel-directory.port';
import { rankCandidates, rankedBanIds } from '@/core/ademe/score-candidates';
import type { AddressMatch } from '@/core/ademe/types';
import { MAX_BUILDING_LOOKUPS } from '@/core/building/types';
import { type AppError, parseInput, validation } from '@/core/errors';
import { ademeDpeDirectory } from '@/infra/external-apis/ademe/ademe-dpe-directory';
import { cadastreParcelDirectory } from '@/infra/external-apis/cadastre/cadastre-parcel-directory';
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
    getBuildingFacts?: typeof getBuildingFacts;
    parcelDirectory?: IParcelDirectory;
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

  // why: une premiere passe designe les adresses qui valent un aller-retour
  // vers la BDNB, puis on reclasse sur les lignes enrichies. La porte
  // anti-preuve-mince se decide donc APRES : l'annee que la BDNB vient de
  // rendre comparable peut a elle seule justifier une reponse.
  const facts = await (deps.getBuildingFacts ?? getBuildingFacts)({
    banIds: rankedBanIds({
      values: fields,
      records: found.value.records,
      limit: MAX_BUILDING_LOOKUPS,
    }),
  });
  if (facts.isErr()) {
    log.warn('ademe.match.enrichment_failed', {
      portal: fields.portal,
      code: facts.error.code,
    });
  }

  // why: le terrain ne concerne que les maisons — la parcelle d'un immeuble
  // porte tous les lots. Inutile donc d'interroger le cadastre autrement, et
  // inutile aussi si l'annonce ne chiffre aucun terrain a comparer.
  const buildingFacts = facts.isOk() ? facts.value : [];
  const parcelIds =
    fields.propertyType === 'house' && fields.landSurfaceM2 !== null
      ? buildingFacts.flatMap((fact) => [...fact.parcelIds])
      : [];
  const parcels =
    parcelIds.length > 0
      ? await (deps.parcelDirectory ?? cadastreParcelDirectory).areasFor({
          parcelIds,
        })
      : null;
  if (parcels?.isErr()) {
    log.warn('ademe.match.parcels_failed', {
      portal: fields.portal,
      code: parcels.error.code,
    });
  }

  const match = rankCandidates({
    values: fields,
    records: enrichRecords({
      records: found.value.records,
      facts: buildingFacts,
      parcelAreas: parcels?.isOk() ? parcels.value : [],
    }),
    truncated: found.value.total > search.filter.limit,
  });

  log.info('ademe.match.success', {
    portal: fields.portal,
    inseeCode: search.filter.inseeCode,
    inspected: match.inspected,
    returned: match.candidates.length,
    truncated: match.truncated,
    refusedFor: match.refusedFor,
    enriched: buildingFacts.length,
    parcels: parcels?.isOk() ? parcels.value.length : 0,
    best: match.candidates[0]?.confidence ?? 0,
  });

  return ok(match);
}
