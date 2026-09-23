import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import type { IDpeDirectory } from '@/core/ademe/ports/dpe-directory.port';
import { repairMojibake } from '@/core/ademe/repair-mojibake';
import type {
  DpeRecord,
  DpeRegister,
  DpeSearchFilter,
} from '@/core/ademe/types';
import { isInseeCode } from '@/core/commune/types';
import { type AppError, externalApi, validation } from '@/core/errors';
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
  'numero_etage_appartement',
  'complement_adresse_batiment',
  'date_etablissement_dpe',
  'score_ban',
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
  numero_etage_appartement: v.optional(v.nullable(v.number())),
  complement_adresse_batiment: v.optional(v.nullable(v.string())),
  date_etablissement_dpe: v.optional(v.nullable(v.string())),
  score_ban: v.optional(v.nullable(v.number())),
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

  const building = text(row.type_batiment)?.toLowerCase() ?? '';

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
    propertyType: PROPERTY_TYPE_BY_BUILDING[building] ?? null,
    surfaceM2: numeric(row.surface_habitable_logement),
    dpeClass: toEnergyClass(row.etiquette_dpe),
    gesClass: toEnergyClass(row.etiquette_ges),
    dpeKwhM2Year: numeric(row.conso_5_usages_par_m2_ep),
    gesKgCo2M2Year: numeric(row.emission_ges_5_usages_par_m2),
    heatingEnergy: toHeatingEnergy(row.type_energie_principale_chauffage),
    yearBuilt: numeric(row.annee_construction),
    floor: numeric(row.numero_etage_appartement),
    buildingComplement: text(row.complement_adresse_batiment),
    establishedOn: text(row.date_etablissement_dpe),
    geocodingScore: numeric(row.score_ban),
  };
}

function buildQueryString(filter: DpeSearchFilter): string {
  // why: le produit promet une adresse exacte. Une ligne sans numero de voie
  // ne peut pas en etre une, et elle concourt sur tous les autres criteres :
  // laissee dans le lot, elle remonte a 100% sur "Rue Jules Verne 69003 Lyon".
  // Mesure du 2026-09-22 : 1266 des 35311 appartements de Lyon 3e, 559 des
  // 3198 de Saint-Genis-Laval.
  const clauses = [
    `code_insee_ban:"${filter.inseeCode}"`,
    '_exists_:numero_voie_ban',
  ];

  if (filter.propertyType !== null) {
    clauses.push(`type_batiment:"${BUILDING_TYPE[filter.propertyType]}"`);
  }
  clauses.push(
    `surface_habitable_logement:[${filter.surfaceMin.toFixed(2)} TO ${filter.surfaceMax.toFixed(2)}]`,
  );
  if (filter.dpeClass !== null) {
    clauses.push(`etiquette_dpe:"${filter.dpeClass}"`);
  }

  return clauses.join(' AND ');
}

async function searchRegister(
  register: (typeof REGISTERS)[number],
  filter: DpeSearchFilter,
): Promise<Result<{ records: DpeRecord[]; total: number }, AppError>> {
  const url = new URL(
    `${env().ADEME_BASE_URL}/data-fair/api/v1/datasets/${register.dataset}/lines`,
  );
  url.searchParams.set('qs', buildQueryString(filter));
  url.searchParams.set('select', SELECTED_FIELDS);
  url.searchParams.set('size', String(filter.limit));

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
      return err(externalApi(PROVIDER, `HTTP ${response.status}`));
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return err(externalApi(PROVIDER, 'Response was not JSON'));
    }

    const parsed = v.safeParse(ResponseSchema, json);
    if (!parsed.success) {
      log.warn('ademe.search.parse_failure', {
        register: register.origin,
        issues: parsed.issues.map((i) => i.message).slice(0, 3),
      });
      return err(externalApi(PROVIDER, 'Unexpected response shape'));
    }

    const records = parsed.output.results
      .map((row) => toRecord(row, register.origin))
      .filter((record): record is DpeRecord => record !== null);

    return ok({ records, total: parsed.output.total });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      return err(externalApi(PROVIDER, 'Request timed out'));
    }
    log.error('ademe.search.exception', e, { register: register.origin });
    return err(externalApi(PROVIDER, 'Network or parser failure'));
  }
}

async function search(
  filter: DpeSearchFilter,
): Promise<Result<{ records: DpeRecord[]; total: number }, AppError>> {
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

  const outcomes = await Promise.all(
    REGISTERS.map((register) => searchRegister(register, filter)),
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
  const records: DpeRecord[] = [];
  let total = 0;

  for (const outcome of outcomes) {
    if (outcome.isErr()) continue;
    total += outcome.value.total;
    for (const record of outcome.value.records) {
      if (seen.has(record.dpeNumber)) continue;
      seen.add(record.dpeNumber);
      records.push(record);
    }
  }

  const answered = outcomes.filter((o) => o.isOk()).length;
  // why: on ne fige que les recherches completes. Si un registre est tombe, la
  // reponse est partielle et la mettre en cache prolongerait la panne bien
  // au-dela d'elle.
  if (answered === REGISTERS.length) {
    await writeCachedSearch(filter, { records, total }, now);
  }

  log.info('ademe.search.success', {
    total,
    returned: records.length,
    registersAnswered: answered,
  });
  return ok({ records, total });
}

export const ademeDpeDirectory: IDpeDirectory = { search };
