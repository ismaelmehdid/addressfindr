import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import type { IDpeDirectory } from '@/core/ademe/ports/dpe-directory.port';
import { repairMojibake } from '@/core/ademe/repair-mojibake';
import type {
  DpeDateSearchFilter,
  DpeRecord,
  DpeRegister,
  DpeSearchFilter,
  UnverifiedDpeRecord,
} from '@/core/ademe/types';
import { isInseeCode } from '@/core/commune/types';
import { type AppError, externalApi, validation } from '@/core/errors';
import { resolveMappablePoint } from '@/core/geo/resolve-mappable-point';
import {
  ENERGY_CLASSES,
  type EnergyClass,
  type PropertyType,
} from '@/core/listing/types';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';
import { toHeatingEnergy } from './heating-energy';
import { readCachedSearch, writeCachedSearch } from './search-cache';

const PROVIDER = 'ademe';

// why: un logement neuf n'est pas dans le registre des logements existants.
// 1 429 026 lignes vivent dans le registre des neufs, dont le slug lisible
// n'existe pas — seul cet identifiant repond. Les deux registres partagent
// exactement le meme schema de champs, verifie le 2026-09-22.
const REGISTERS = [
  { dataset: 'dpe03existant', origin: 'existing' },
  { dataset: 'g3cgx7jb3cmys5voxz1mrm22', origin: 'new' },
] as const satisfies readonly { dataset: string; origin: DpeRegister }[];

const SELECTED_FIELDS = [
  'numero_dpe',
  'identifiant_ban',
  'adresse_ban',
  'numero_voie_ban',
  'nom_rue_ban',
  'code_postal_ban',
  'nom_commune_ban',
  'code_insee_ban',
  'type_batiment',
  'surface_habitable_logement',
  'etiquette_dpe',
  'etiquette_ges',
  'conso_5_usages_par_m2_ep',
  'emission_ges_5_usages_par_m2',
  'type_energie_principale_chauffage',
  'annee_construction',
  'nombre_niveau_immeuble',
  'numero_etage_appartement',
  'complement_adresse_batiment',
  'date_etablissement_dpe',
  'date_visite_diagnostiqueur',
  'cout_total_5_usages',
  'score_ban',
  'statut_geocodage',
  '_geopoint',
  'adresse_brut',
  'code_postal_brut',
  'nom_commune_brut',
].join(',');

const BUILDING_TYPE: Record<PropertyType, string> = {
  apartment: 'appartement',
  house: 'maison',
};

const PROPERTY_TYPE_BY_BUILDING: Record<string, PropertyType> = {
  appartement: 'apartment',
  maison: 'house',
};

const RowSchema = v.object({
  numero_dpe: v.optional(v.nullable(v.string())),
  identifiant_ban: v.optional(v.nullable(v.string())),
  adresse_ban: v.optional(v.nullable(v.string())),
  numero_voie_ban: v.optional(v.nullable(v.string())),
  nom_rue_ban: v.optional(v.nullable(v.string())),
  code_postal_ban: v.optional(v.nullable(v.string())),
  nom_commune_ban: v.optional(v.nullable(v.string())),
  code_insee_ban: v.optional(v.nullable(v.string())),
  type_batiment: v.optional(v.nullable(v.string())),
  surface_habitable_logement: v.optional(v.nullable(v.number())),
  etiquette_dpe: v.optional(v.nullable(v.string())),
  etiquette_ges: v.optional(v.nullable(v.string())),
  conso_5_usages_par_m2_ep: v.optional(v.nullable(v.number())),
  emission_ges_5_usages_par_m2: v.optional(v.nullable(v.number())),
  type_energie_principale_chauffage: v.optional(v.nullable(v.string())),
  annee_construction: v.optional(v.nullable(v.number())),
  nombre_niveau_immeuble: v.optional(v.nullable(v.number())),
  numero_etage_appartement: v.optional(v.nullable(v.number())),
  complement_adresse_batiment: v.optional(v.nullable(v.string())),
  date_etablissement_dpe: v.optional(v.nullable(v.string())),
  date_visite_diagnostiqueur: v.optional(v.nullable(v.string())),
  cout_total_5_usages: v.optional(v.nullable(v.number())),
  score_ban: v.optional(v.nullable(v.number())),
  statut_geocodage: v.optional(v.nullable(v.string())),
  _geopoint: v.optional(v.nullable(v.string())),
  adresse_brut: v.optional(v.nullable(v.string())),
  code_postal_brut: v.optional(v.nullable(v.union([v.number(), v.string()]))),
  nom_commune_brut: v.optional(v.nullable(v.string())),
});

const ResponseSchema = v.object({
  total: v.optional(v.number(), 0),
  results: v.optional(v.array(RowSchema), []),
});

type Row = v.InferOutput<typeof RowSchema>;

function toEnergyClass(raw: string | null | undefined): EnergyClass | null {
  if (typeof raw !== 'string') return null;
  const letter = raw.trim().toUpperCase();
  return (ENERGY_CLASSES as readonly string[]).includes(letter)
    ? (letter as EnergyClass)
    : null;
}

function text(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = repairMojibake(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numeric(raw: number | null | undefined): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

// why: l'ADEME annonce son geocodage dans une phrase libre, et certaines lignes
// sont stockees en double encodage. Une egalite brute sur la chaine accentuee
// casse des qu'un caractere est repare, d'ou la comparaison sur forme pliee.
// Tout libelle inconnu est refuse : la mesure du 2026-09-23 sur 5000 lignes
// n'en connait que deux, mais une valeur inattendue doit fermer la porte.
const GEOCODED_TO_ADDRESS = "adresse geocodee ban a l'adresse";

function foldGeocodingStatus(raw: string): string {
  return repairMojibake(raw)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGeocodedToAddress(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string') return false;
  return foldGeocodingStatus(raw) === GEOCODED_TO_ADDRESS;
}

type Dwelling = Omit<
  UnverifiedDpeRecord,
  'dpeNumber' | 'dataset' | 'rawStreet' | 'rawPostalCode' | 'rawCity'
>;

function dwellingOf(row: Row): Dwelling {
  const building = text(row.type_batiment)?.toLowerCase() ?? '';
  return {
    propertyType: PROPERTY_TYPE_BY_BUILDING[building] ?? null,
    surfaceM2: numeric(row.surface_habitable_logement),
    dpeClass: toEnergyClass(row.etiquette_dpe),
    gesClass: toEnergyClass(row.etiquette_ges),
    dpeKwhM2Year: numeric(row.conso_5_usages_par_m2_ep),
    gesKgCo2M2Year: numeric(row.emission_ges_5_usages_par_m2),
    heatingEnergy: toHeatingEnergy(row.type_energie_principale_chauffage),
    yearBuilt: numeric(row.annee_construction),
    buildingFloors: numeric(row.nombre_niveau_immeuble),
    // why: l'ADEME n'a pas la surface du terrain. Elle vient du cadastre, via
    // l'identifiant de parcelle que la BDNB rattache a l'adresse.
    landSurfaceM2: null,
    floor: numeric(row.numero_etage_appartement),
    buildingComplement: text(row.complement_adresse_batiment),
    establishedOn: text(row.date_etablissement_dpe),
    visitedOn: text(row.date_visite_diagnostiqueur),
    annualEnergyCostEur: numeric(row.cout_total_5_usages),
  };
}

function toRecord(row: Row, dataset: DpeRegister): DpeRecord | null {
  const dpeNumber = text(row.numero_dpe);
  const inseeCode = text(row.code_insee_ban);
  const address = text(row.adresse_ban);
  const streetNumber = text(row.numero_voie_ban);
  if (
    dpeNumber === null ||
    inseeCode === null ||
    address === null ||
    streetNumber === null
  ) {
    return null;
  }

  return {
    dpeNumber,
    dataset,
    banId: text(row.identifiant_ban),
    address,
    streetNumber,
    street: text(row.nom_rue_ban),
    postalCode: text(row.code_postal_ban),
    city: text(row.nom_commune_ban),
    inseeCode: inseeCode.toUpperCase(),
    ...dwellingOf(row),
    geocodingScore: numeric(row.score_ban),
    point: resolveMappablePoint({
      rawPoint: text(row._geopoint),
      geocodedToAddress: isGeocodedToAddress(row.statut_geocodage),
      postalCode: text(row.code_postal_ban),
    }),
  };
}

// why: ADEME stores code_postal_brut as a number, so "01500" arrives as 1500.
function rawPostalCode(raw: number | string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).trim();
  if (!/^\d{4,5}$/.test(digits)) return null;
  return digits.padStart(5, '0');
}

function toUnverifiedRecord(
  row: Row,
  dataset: DpeRegister,
): UnverifiedDpeRecord | null {
  const dpeNumber = text(row.numero_dpe);
  const rawStreet = text(row.adresse_brut);
  if (dpeNumber === null || rawStreet === null) return null;
  return {
    dpeNumber,
    dataset,
    rawStreet,
    rawPostalCode: rawPostalCode(row.code_postal_brut),
    rawCity: text(row.nom_commune_brut),
    ...dwellingOf(row),
  };
}

function dwellingClauses(
  filter: Pick<
    DpeSearchFilter,
    'propertyType' | 'surfaceMin' | 'surfaceMax' | 'dpeClass'
  >,
): string[] {
  const clauses: string[] = [];

  if (filter.propertyType !== null) {
    clauses.push(`type_batiment:"${BUILDING_TYPE[filter.propertyType]}"`);
  }
  clauses.push(
    `surface_habitable_logement:[${filter.surfaceMin.toFixed(2)} TO ${filter.surfaceMax.toFixed(2)}]`,
  );
  if (filter.dpeClass !== null) {
    clauses.push(`etiquette_dpe:"${filter.dpeClass}"`);
  }
  return clauses;
}

// why: le produit promet une adresse exacte. Une ligne sans numero de voie
// ne peut pas en etre une, et elle concourt sur tous les autres criteres :
// laissee dans le lot, elle remonte a 100% sur "Rue Jules Verne 69003 Lyon".
// Mesure du 2026-09-22 : 1266 des 35311 appartements de Lyon 3e, 559 des
// 3198 de Saint-Genis-Laval.
const HAS_STREET_NUMBER = '_exists_:numero_voie_ban';

function buildQueryString(filter: DpeSearchFilter): string {
  return [
    `code_insee_ban:"${filter.inseeCode}"`,
    HAS_STREET_NUMBER,
    ...dwellingClauses(filter),
  ].join(' AND ');
}

// why: a row ADEME never geocoded has no code_insee_ban, only the postal code
// the diagnostician typed. Its house number is read later, from the raw line.
function buildUnverifiedQueryString(
  filter: DpeSearchFilter,
  postalCodes: readonly string[],
): string {
  return [
    'NOT _exists_:code_insee_ban',
    `code_postal_brut:(${postalCodes.map((code) => `"${code}"`).join(' OR ')})`,
    ...dwellingClauses(filter),
  ].join(' AND ');
}

function buildDateQueryString(filter: DpeDateSearchFilter): string {
  return [
    `code_departement_ban:"${filter.departmentCode}"`,
    `(date_etablissement_dpe:"${filter.dpeDate}" OR date_visite_diagnostiqueur:"${filter.dpeDate}")`,
    HAS_STREET_NUMBER,
    ...dwellingClauses(filter),
  ].join(' AND ');
}

type RowMapper<T> = (row: Row, dataset: DpeRegister) => T | null;

type RegisterAnswer<T> = Result<{ records: T[]; total: number }, AppError>;

async function requestRegister<T>(
  register: (typeof REGISTERS)[number],
  query: { qs: string; limit: number },
  map: RowMapper<T>,
): Promise<{ answer: RegisterAnswer<T>; transient: boolean }> {
  const url = new URL(
    `${env().ADEME_BASE_URL}/data-fair/api/v1/datasets/${register.dataset}/lines`,
  );
  url.searchParams.set('qs', query.qs);
  url.searchParams.set('select', SELECTED_FIELDS);
  url.searchParams.set('size', String(query.limit));

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(env().ADEME_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      log.warn('ademe.search.http_failure', {
        register: register.origin,
        status: response.status,
        body: body.slice(0, 200),
      });
      return {
        answer: err(externalApi(PROVIDER, `HTTP ${response.status}`)),
        transient: response.status === 429 || response.status >= 500,
      };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return {
        answer: err(externalApi(PROVIDER, 'Response was not JSON')),
        transient: true,
      };
    }

    const parsed = v.safeParse(ResponseSchema, json);
    if (!parsed.success) {
      log.warn('ademe.search.parse_failure', {
        register: register.origin,
        issues: parsed.issues.map((i) => i.message).slice(0, 3),
      });
      return {
        answer: err(externalApi(PROVIDER, 'Unexpected response shape')),
        transient: false,
      };
    }

    const records = parsed.output.results
      .map((row) => map(row, register.origin))
      .filter((record): record is T => record !== null);

    return {
      answer: ok({ records, total: parsed.output.total }),
      transient: false,
    };
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      return {
        answer: err(externalApi(PROVIDER, 'Request timed out')),
        transient: true,
      };
    }
    log.error('ademe.search.exception', e, { register: register.origin });
    return {
      answer: err(externalApi(PROVIDER, 'Network or parser failure')),
      transient: true,
    };
  }
}

// why: measured 2026-09-24, data.ademe.fr timed out then reset every
// connection for about 17 minutes, and the same searches answered normally
// afterwards. A read is safe to repeat, so a transient failure gets one more
// try before the match fails; a malformed query never does.
const MAX_REGISTER_ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;

async function searchRegister<T>(
  register: (typeof REGISTERS)[number],
  query: { qs: string; limit: number },
  map: RowMapper<T>,
): Promise<RegisterAnswer<T>> {
  for (let attempt = 1; ; attempt += 1) {
    const { answer, transient } = await requestRegister(register, query, map);
    if (answer.isOk() || !transient || attempt >= MAX_REGISTER_ATTEMPTS) {
      return answer;
    }
    log.warn('ademe.search.retry', { register: register.origin, attempt });
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
}

// why: a postal code is interpolated into a Lucene query. It comes from a
// resolved commune, but is checked again before that.
const POSTAL_CODE_PATTERN = /^\d{5}$/;

async function searchUnverified(
  filter: DpeSearchFilter,
): Promise<Result<UnverifiedDpeRecord[], AppError>> {
  const postalCodes = filter.postalCodes.filter((code) =>
    POSTAL_CODE_PATTERN.test(code),
  );
  if (postalCodes.length === 0) return ok([]);
  const merged = await searchRegisters(
    {
      qs: buildUnverifiedQueryString(filter, postalCodes),
      limit: filter.limit,
    },
    toUnverifiedRecord,
  );
  return merged.map(({ records }) => records);
}

async function search(filter: DpeSearchFilter): Promise<
  Result<
    {
      records: DpeRecord[];
      unverified: UnverifiedDpeRecord[];
      total: number;
      truncated: boolean;
    },
    AppError
  >
> {
  // why: la valeur part dans une requete Lucene. Elle vient d'une commune
  // resolue, mais on ne la prend pas sur parole avant de l'interpoler.
  if (!isInseeCode(filter.inseeCode)) {
    return err(validation('Invalid INSEE code', 'inseeCode'));
  }

  log.info('ademe.search.start', {
    inseeCode: filter.inseeCode,
    hasDpeClass: filter.dpeClass !== null,
    limit: filter.limit,
  });

  const now = Date.now();
  const cached = await readCachedSearch(filter, now);
  if (cached !== null) {
    log.info('ademe.search.cache_hit', {
      inseeCode: filter.inseeCode,
      returned: cached.records.length,
    });
    return ok(cached);
  }

  const [merged, unverified] = await Promise.all([
    searchRegisters(
      { qs: buildQueryString(filter), limit: filter.limit },
      toRecord,
    ),
    searchUnverified(filter),
  ]);
  if (merged.isErr()) return err(merged.error);
  const { answered, ...geocoded } = merged.value;
  // why: the unverified rows complete the geocoded ones. Losing them narrows
  // the answer; it must not break it.
  if (unverified.isErr()) {
    log.warn('ademe.search.unverified_failed', { code: unverified.error.code });
  }
  const found = {
    ...geocoded,
    unverified: unverified.isOk() ? unverified.value : [],
  };

  // why: on ne fige que les recherches completes. Si un registre est tombe, la
  // reponse est partielle et la mettre en cache prolongerait la panne bien
  // au-dela d'elle.
  if (answered === REGISTERS.length && unverified.isOk()) {
    await writeCachedSearch(filter, found, now);
  }

  log.info('ademe.search.success', {
    total: found.total,
    returned: found.records.length,
    unverified: found.unverified.length,
    truncated: found.truncated,
    registersAnswered: answered,
  });
  return ok(found);
}

async function searchRegisters<T extends { dpeNumber: string }>(
  query: { qs: string; limit: number },
  map: RowMapper<T>,
): Promise<
  Result<
    {
      records: T[];
      total: number;
      truncated: boolean;
      answered: number;
    },
    AppError
  >
> {
  const outcomes = await Promise.all(
    REGISTERS.map((register) => searchRegister(register, query, map)),
  );

  const [existing] = outcomes;
  // why: le registre des existants porte l'essentiel du volume. S'il tombe,
  // la reponse serait silencieusement amputee — mieux vaut echouer. Celui des
  // neufs est un complement : sa panne ne doit pas casser une annonce d'ancien.
  if (existing === undefined || existing.isErr()) {
    return err(
      existing?.isErr()
        ? existing.error
        : externalApi(PROVIDER, 'No register answered'),
    );
  }

  const seen = new Set<string>();
  const records: T[] = [];
  let total = 0;
  let truncated = false;

  for (const outcome of outcomes) {
    if (outcome.isErr()) continue;
    total += outcome.value.total;
    if (outcome.value.total > query.limit) truncated = true;
    for (const record of outcome.value.records) {
      if (seen.has(record.dpeNumber)) continue;
      seen.add(record.dpeNumber);
      records.push(record);
    }
  }

  const answered = outcomes.filter((o) => o.isOk()).length;
  return ok({ records, total, truncated, answered });
}

// why: both values are interpolated into a Lucene query. They come from a
// resolved commune and a parsed date, but are checked again before that.
const DEPARTMENT_CODE_PATTERN = /^(\d{2}|2[AB]|97\d)$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function searchByDate(
  filter: DpeDateSearchFilter,
): Promise<
  Result<{ records: DpeRecord[]; total: number; truncated: boolean }, AppError>
> {
  if (!DEPARTMENT_CODE_PATTERN.test(filter.departmentCode)) {
    return err(validation('Invalid department code', 'departmentCode'));
  }
  if (!ISO_DATE_PATTERN.test(filter.dpeDate)) {
    return err(validation('Invalid DPE date', 'dpeDate'));
  }

  log.info('ademe.search_by_date.start', {
    departmentCode: filter.departmentCode,
    limit: filter.limit,
  });

  const merged = await searchRegisters(
    { qs: buildDateQueryString(filter), limit: filter.limit },
    toRecord,
  );
  if (merged.isErr()) return err(merged.error);
  const { answered, ...found } = merged.value;

  log.info('ademe.search_by_date.success', {
    total: found.total,
    returned: found.records.length,
    registersAnswered: answered,
  });
  return ok(found);
}

export const ademeDpeDirectory: IDpeDirectory = { search, searchByDate };
