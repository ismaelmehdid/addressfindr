import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import type { ICommuneDirectory } from '@/core/commune/ports/commune-directory.port';
import type { Commune } from '@/core/commune/types';
import { type AppError, externalApi } from '@/core/errors';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const PROVIDER = 'geo-gouv';
const FIELDS = 'nom,code,codesPostaux,type';
const ARRONDISSEMENT_TYPE = 'arrondissement-municipal';
// why: sans ce parametre l'API rend la commune mere (69123 Lyon) et jamais
// l'arrondissement (69383), qui est la clef reellement utilisee par l'ADEME.
const REQUESTED_TYPES = `commune-actuelle,${ARRONDISSEMENT_TYPE}`;

const CommuneSchema = v.object({
  nom: v.pipe(v.string(), v.minLength(1)),
  code: v.pipe(v.string(), v.minLength(1)),
  codesPostaux: v.optional(v.array(v.string()), []),
  type: v.optional(v.string(), ''),
});

const CommuneListSchema = v.array(CommuneSchema);

type RawCommune = v.InferOutput<typeof CommuneSchema>;

function toCommune(raw: RawCommune): Commune {
  return {
    inseeCode: raw.code.toUpperCase(),
    name: raw.nom,
    postalCodes: raw.codesPostaux,
    isArrondissement: raw.type === ARRONDISSEMENT_TYPE,
  };
}

function buildUrl(path: string, params: Record<string, string>): URL {
  const url = new URL(`${env().GEO_GOUV_BASE_URL}${path}`);
  url.searchParams.set('fields', FIELDS);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function requestJson(
  url: URL,
): Promise<Result<unknown, AppError> | 'not-found'> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(env().GEO_GOUV_TIMEOUT_MS),
  });

  if (response.status === 404) return 'not-found';

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    log.warn('commune.directory.http_failure', {
      status: response.status,
      body: body.slice(0, 200),
    });
    return err(externalApi(PROVIDER, `HTTP ${response.status}`));
  }

  try {
    return ok(await response.json());
  } catch {
    return err(externalApi(PROVIDER, 'Response was not JSON'));
  }
}

function toAppError(e: unknown): AppError {
  if (e instanceof Error && e.name === 'TimeoutError') {
    return externalApi(PROVIDER, 'Request timed out');
  }
  log.error('commune.directory.exception', e);
  return externalApi(PROVIDER, 'Network or parser failure');
}

async function findByPostalCode(input: {
  postalCode: string;
}): Promise<Result<Commune[], AppError>> {
  const url = buildUrl('/communes', {
    codePostal: input.postalCode,
    type: REQUESTED_TYPES,
  });

  log.info('commune.directory.lookup.start', { by: 'postal-code' });

  try {
    const body = await requestJson(url);
    if (body === 'not-found') return ok([]);
    if (body.isErr()) return err(body.error);

    const parsed = v.safeParse(CommuneListSchema, body.value);
    if (!parsed.success) {
      log.warn('commune.directory.parse_failure', {
        issues: parsed.issues.map((i) => i.message).slice(0, 3),
      });
      return err(externalApi(PROVIDER, 'Unexpected response shape'));
    }

    const communes = parsed.output.map(toCommune);
    log.info('commune.directory.lookup.success', {
      by: 'postal-code',
      count: communes.length,
    });
    return ok(communes);
  } catch (e) {
    return err(toAppError(e));
  }
}

async function findByInseeCode(input: {
  inseeCode: string;
}): Promise<Result<Commune | null, AppError>> {
  const url = buildUrl(`/communes/${encodeURIComponent(input.inseeCode)}`, {});

  log.info('commune.directory.lookup.start', { by: 'insee-code' });

  try {
    const body = await requestJson(url);
    if (body === 'not-found') return ok(null);
    if (body.isErr()) return err(body.error);

    const parsed = v.safeParse(CommuneSchema, body.value);
    if (!parsed.success) {
      log.warn('commune.directory.parse_failure', {
        issues: parsed.issues.map((i) => i.message).slice(0, 3),
      });
      return err(externalApi(PROVIDER, 'Unexpected response shape'));
    }

    log.info('commune.directory.lookup.success', {
      by: 'insee-code',
      count: 1,
    });
    return ok(toCommune(parsed.output));
  } catch (e) {
    return err(toAppError(e));
  }
}

export const geoGouvCommuneDirectory: ICommuneDirectory = {
  findByPostalCode,
  findByInseeCode,
};
