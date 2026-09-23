import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import type { IBuildingDirectory } from '@/core/building/ports/building-directory.port';
import {
  type BuildingFacts,
  MAX_BUILDING_LOOKUPS,
} from '@/core/building/types';
import { type AppError, externalApi } from '@/core/errors';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const PROVIDER = 'bdnb';

// why: la BDNB n'expose pas les attributs a l'adresse. Il faut deux sauts :
// la cle BAN donne un batiment_groupe_id, le groupe porte les attributs.
const RELATION_TABLE = 'rel_batiment_groupe_adresse';
const BUILDING_TABLE = 'batiment_groupe_complet';

// why: la cle part dans un filtre PostgREST `in.(a,b,c)`. Une virgule ou une
// parenthese dans une valeur casserait la requete ou l'elargirait. Le format
// BAN est strict — INSEE, code voie, numero, suffixe optionnel — donc tout ce
// qui n'y ressemble pas est ecarte avant d'atteindre le reseau.
const BAN_KEY_PATTERN = /^[0-9AB]{5}_[0-9A-Za-z]{1,8}_[0-9A-Za-z_]{1,12}$/;

const RelationSchema = v.object({
  cle_interop_adr: v.string(),
  batiment_groupe_id: v.string(),
});

const BuildingSchema = v.object({
  batiment_groupe_id: v.string(),
  annee_construction: v.optional(v.nullable(v.number())),
  nb_niveau: v.optional(v.nullable(v.number())),
  l_parcelle_id: v.optional(v.nullable(v.array(v.string()))),
});

const RelationListSchema = v.array(RelationSchema);
const BuildingListSchema = v.array(BuildingSchema);

function numeric(raw: number | null | undefined): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function buildUrl(
  table: string,
  column: string,
  values: readonly string[],
  select: string,
): URL {
  const url = new URL(`${env().BDNB_BASE_URL}/v1/bdnb/donnees/${table}`);
  url.searchParams.set(column, `in.(${values.join(',')})`);
  url.searchParams.set('select', select);
  url.searchParams.set('limit', String(values.length * 4));
  return url;
}

async function fetchRows<T>(
  url: URL,
  schema: v.GenericSchema<unknown, T[]>,
): Promise<Result<T[], AppError>> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(env().BDNB_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    log.warn('building.lookup.http_failure', {
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

  const parsed = v.safeParse(schema, json);
  if (!parsed.success) {
    log.warn('building.lookup.parse_failure', {
      issues: parsed.issues.map((i) => i.message).slice(0, 3),
    });
    return err(externalApi(PROVIDER, 'Unexpected response shape'));
  }
  return ok(parsed.output);
}

async function factsForAddresses(input: {
  banIds: readonly string[];
}): Promise<Result<BuildingFacts[], AppError>> {
  const wanted = [...new Set(input.banIds)]
    .filter((id) => BAN_KEY_PATTERN.test(id))
    .slice(0, MAX_BUILDING_LOOKUPS);
  if (wanted.length === 0) return ok([]);

  log.info('building.lookup.start', { addresses: wanted.length });

  try {
    const relations = await fetchRows(
      buildUrl(
        RELATION_TABLE,
        'cle_interop_adr',
        wanted,
        'cle_interop_adr,batiment_groupe_id',
      ),
      RelationListSchema,
    );
    if (relations.isErr()) return err(relations.error);

    const buildingIds = [
      ...new Set(relations.value.map((r) => r.batiment_groupe_id)),
    ].filter((id) => /^[0-9A-Za-z-]{1,64}$/.test(id));
    if (buildingIds.length === 0) {
      log.info('building.lookup.success', {
        addresses: wanted.length,
        found: 0,
      });
      return ok([]);
    }

    const buildings = await fetchRows(
      buildUrl(
        BUILDING_TABLE,
        'batiment_groupe_id',
        buildingIds,
        'batiment_groupe_id,annee_construction,nb_niveau,l_parcelle_id',
      ),
      BuildingListSchema,
    );
    if (buildings.isErr()) return err(buildings.error);

    const byBuildingId = new Map(
      buildings.value.map((b) => [b.batiment_groupe_id, b]),
    );

    const facts: BuildingFacts[] = [];
    const seen = new Set<string>();
    for (const relation of relations.value) {
      if (seen.has(relation.cle_interop_adr)) continue;
      const building = byBuildingId.get(relation.batiment_groupe_id);
      if (building === undefined) continue;
      seen.add(relation.cle_interop_adr);
      facts.push({
        banId: relation.cle_interop_adr,
        yearBuilt: numeric(building.annee_construction),
        floors: numeric(building.nb_niveau),
        parcelIds: building.l_parcelle_id ?? [],
      });
    }

    log.info('building.lookup.success', {
      addresses: wanted.length,
      found: facts.length,
    });
    return ok(facts);
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      return err(externalApi(PROVIDER, 'Request timed out'));
    }
    log.error('building.lookup.exception', e);
    return err(externalApi(PROVIDER, 'Network or parser failure'));
  }
}

export const bdnbBuildingDirectory: IBuildingDirectory = { factsForAddresses };
