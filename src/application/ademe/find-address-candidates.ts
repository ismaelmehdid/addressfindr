import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { getBuildingFacts } from '@/application/building/get-building-facts';
import { resolveCommune } from '@/application/commune/resolve-commune';
import { verifyRawAddress } from '@/application/geo/verify-raw-address';
import { buildDateSearch, buildDpeSearch } from '@/core/ademe/build-search';
import { enrichRecords } from '@/core/ademe/enrich-records';
import type { IDpeDirectory } from '@/core/ademe/ports/dpe-directory.port';
import type { IParcelDirectory } from '@/core/ademe/ports/parcel-directory.port';
import {
  admitsOutsideCommune,
  carriesDpeDate,
  rankCandidates,
  rankedBanIds,
} from '@/core/ademe/score-candidates';
import type {
  AddressMatch,
  DpeRecord,
  UnverifiedDpeRecord,
} from '@/core/ademe/types';
import {
  recordFromVerifiedAddress,
  unverifiedWorthVerifying,
} from '@/core/ademe/unverified-records';
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
    verifyRawAddress?: typeof verifyRawAddress;
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

  const resolved =
    commune.value.kind === 'resolved' ? commune.value.commune : null;

  const search = buildDpeSearch({
    inseeCode: resolved?.inseeCode ?? null,
    postalCodes: resolved?.postalCodes ?? [],
    values: fields,
  });
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

  const dated = await rowsCarryingListedDate({
    directory,
    values: fields,
    inseeCode: search.filter.inseeCode,
    inCommune: found.value.records,
  });
  const verified = await verifiedRecords({
    verify: deps.verifyRawAddress ?? verifyRawAddress,
    values: fields,
    inseeCode: search.filter.inseeCode,
    records: [...found.value.records, ...dated],
    unverified: found.value.unverified,
  });
  const records = [...found.value.records, ...dated, ...verified];

  // why: une premiere passe designe les adresses qui valent un aller-retour
  // vers la BDNB, puis on reclasse sur les lignes enrichies. La porte
  // anti-preuve-mince se decide donc APRES : l'annee que la BDNB vient de
  // rendre comparable peut a elle seule justifier une reponse.
  const facts = await (deps.getBuildingFacts ?? getBuildingFacts)({
    banIds: rankedBanIds({
      values: fields,
      records,
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
      records,
      facts: buildingFacts,
      parcelAreas: parcels?.isOk() ? parcels.value : [],
    }),
    truncated: found.value.truncated,
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
    recoveredByDate: dated.length,
    unverified: found.value.unverified.length,
    verified: verified.length,
    best: match.candidates[0]?.confidence ?? 0,
  });

  return ok(match);
}

// why: when no row of the commune search carries the listing's DPE date, the
// department is searched on that exact date. It recovers a row of the commune
// that the fetch limit cut off (measured 2026-09-24: 5570 Nantes rows for a
// 5000-row limit), and a row from another commune when the listing names the
// wrong one (a house described as in Melesse, listed under Rennes). A row
// from another commune is kept only if it also matches a label number.
async function rowsCarryingListedDate(input: {
  directory: IDpeDirectory;
  values: FindAddressCandidatesInput['listing']['fields'];
  inseeCode: string;
  inCommune: readonly DpeRecord[];
}): Promise<DpeRecord[]> {
  const { dpeDate } = input.values;
  if (dpeDate === null) return [];
  if (input.inCommune.some((record) => carriesDpeDate(record, dpeDate))) {
    return [];
  }
  const filter = buildDateSearch({
    inseeCode: input.inseeCode,
    values: input.values,
  });
  if (filter === null) return [];

  const found = await input.directory.searchByDate(filter);
  if (found.isErr()) {
    log.warn('ademe.match.date_search_failed', { code: found.error.code });
    return [];
  }
  const known = new Set(input.inCommune.map((record) => record.dpeNumber));
  return found.value.records.filter(
    (record) =>
      !known.has(record.dpeNumber) &&
      (record.inseeCode === input.inseeCode ||
        admitsOutsideCommune({ values: input.values, record })),
  );
}

// why: a row ADEME never geocoded carries only the address the diagnostician
// typed. Only those that would reach the shortlist are worth a geocoder call,
// one per distinct typed address, and a row the register does not recognise
// is dropped — it never reaches the answer with its typed address.
async function verifiedRecords(input: {
  verify: typeof verifyRawAddress;
  values: FindAddressCandidatesInput['listing']['fields'];
  inseeCode: string;
  records: readonly DpeRecord[];
  unverified: readonly UnverifiedDpeRecord[];
}): Promise<DpeRecord[]> {
  const worth = unverifiedWorthVerifying({
    values: input.values,
    records: input.records,
    unverified: input.unverified,
    inseeCode: input.inseeCode,
  });
  if (worth.length === 0) return [];

  const typedAddress = (row: UnverifiedDpeRecord): string =>
    [row.rawStreet, row.rawPostalCode ?? '', row.rawCity ?? ''].join('|');
  const distinct = new Map(worth.map((row) => [typedAddress(row), row]));
  const answers = new Map(
    await Promise.all(
      [...distinct].map(async ([key, row]) => {
        const answer = await input.verify({
          rawStreet: row.rawStreet,
          postalCode: row.rawPostalCode,
          city: row.rawCity,
          inseeCode: input.inseeCode,
        });
        if (answer.isErr()) {
          log.warn('ademe.match.verify_failed', { code: answer.error.code });
        }
        return [key, answer.isOk() ? answer.value : null] as const;
      }),
    ),
  );

  return worth.flatMap((row) => {
    const address = answers.get(typedAddress(row));
    return address ? [recordFromVerifiedAddress(row, address)] : [];
  });
}
