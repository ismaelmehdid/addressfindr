import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { loadDotEnv } from '../../../test/load-env';

loadDotEnv();

const { externalApi } = await import('@/core/errors');
const { extractListing } = await import('./extract-listing');
const { findAddressCandidates } = await import(
  '@/application/ademe/find-address-candidates'
);
const { groqListingExtractor } = await import(
  '@/infra/external-apis/groq/groq-listing-extractor'
);

// why: precisement.fr is the market reference. This harness runs the same
// leboncoin listings through both products and measures the gap, taking their
// answer as right. Scraped pages, precisement answers and model quotes are
// cached on disk: rerunning after a fix spends no Firecrawl credit, sends them
// no request, and spends no Groq token on a source the model already read —
// the free tier allows 200 000 tokens a day, about 110 listings.
const URLS_PATH =
  process.env.BENCH_URLS_PATH ?? 'test/fixtures/precisement-benchmark-urls.txt';
const CACHE_DIR = process.env.BENCH_CACHE_DIR ?? '.benchmark/cache';
const REPORT_PATH = process.env.BENCH_REPORT_PATH ?? '.benchmark/report.txt';
const DUMP_PATH = process.env.BENCH_DUMP_PATH ?? '.benchmark/dump.json';
const ADEME_BASE_URL = 'https://data.ademe.fr';
const ADEME_REGISTERS = ['dpe03existant', 'g3cgx7jb3cmys5voxz1mrm22'];

type Page = { markdown: string; rawHtml: string; finalUrl: string };

type PrecisementCandidate = {
  address: string;
  score: number;
  dpe: string | null;
  origin: string | null;
  surface: number | null;
  dpe_label: string | null;
  ges_label: string | null;
  type_batiment: string | null;
  discarded_by: string | null;
  designated_by: string | null;
  geo: { lat: number; lng: number } | null;
};

type PrecisementAnswer = {
  data: PrecisementCandidate[];
  meta?: { notices?: { code: string }[]; listing?: Record<string, unknown> };
};

function cachePath(kind: string, url: string): string {
  const id = url.replace(/[^a-zA-Z0-9]+/g, '_').slice(-80);
  return path.join(CACHE_DIR, `${kind}-${id}.json`);
}

function readCache<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function writeCache(file: string, value: unknown): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(value), 'utf8');
}

async function scrapeLive(url: string): Promise<Page | null> {
  const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.FIRECRAWL_API_KEY ?? ''}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown', 'rawHtml'],
      onlyMainContent: false,
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    data?: { markdown?: string; rawHtml?: string };
  };
  const markdown = body.data?.markdown ?? '';
  const rawHtml = body.data?.rawHtml ?? '';
  if (markdown.length === 0 && rawHtml.length === 0) return null;
  return { markdown, rawHtml, finalUrl: url };
}

const cachedScraper = {
  async scrape(input: { url: string }) {
    const file = cachePath('page', input.url);
    const cached = readCache<Page>(file);
    if (cached !== null) return ok(cached);
    const page = await scrapeLive(input.url);
    if (page === null) return err(externalApi('firecrawl', 'scrape failed'));
    writeCache(file, page);
    return ok(page);
  },
};

// why: keyed on the exact source and the fields asked. A change to what the
// model reads or is asked for misses the cache and calls it again.
const cachedExtractor: typeof groqListingExtractor = {
  async extractQuotes(input) {
    const key = createHash('sha256')
      .update(JSON.stringify([input.markdown, input.missing]))
      .digest('hex')
      .slice(0, 24);
    const file = path.join(CACHE_DIR, `quotes-${key}.json`);
    const cached = readCache<Record<string, string>>(file);
    if (cached !== null) return ok(cached);
    const quotes = await groqListingExtractor.extractQuotes(input);
    if (quotes.isOk()) writeCache(file, quotes.value);
    return quotes;
  },
};

function normalizeAddress(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function askPrecisement(url: string): Promise<PrecisementAnswer | null> {
  const file = cachePath('precisement', url);
  const cached = readCache<PrecisementAnswer>(file);
  if (cached !== null) return cached;
  const response = await fetch('https://api.precisement.fr/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      origin: 'https://precisement.fr',
      referer: 'https://precisement.fr/',
    },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) return null;
  const answer = (await response.json()) as PrecisementAnswer;
  for (const candidate of answer.data) {
    delete (candidate as Record<string, unknown>).streetview;
  }
  writeCache(file, answer);
  return answer;
}

type AdemeRow = Record<string, string | number | null>;

async function ademeRowByNumber(dpeNumber: string): Promise<AdemeRow | null> {
  for (const dataset of ADEME_REGISTERS) {
    const url = new URL(
      `${ADEME_BASE_URL}/data-fair/api/v1/datasets/${dataset}/lines`,
    );
    url.searchParams.set('qs', `numero_dpe:"${dpeNumber}"`);
    url.searchParams.set(
      'select',
      [
        'numero_dpe',
        'adresse_ban',
        'numero_voie_ban',
        'code_insee_ban',
        'type_batiment',
        'surface_habitable_logement',
        'etiquette_dpe',
        'etiquette_ges',
        'conso_5_usages_par_m2_ep',
        'emission_ges_5_usages_par_m2',
        'annee_construction',
        'numero_etage_appartement',
        'date_etablissement_dpe',
        'date_visite_diagnostiqueur',
        'cout_total_5_usages',
        'type_energie_principale_chauffage',
      ].join(','),
    );
    const response = await fetch(url).catch(() => null);
    if (!response?.ok) continue;
    const body = (await response.json()) as { results?: AdemeRow[] };
    const row = body.results?.[0];
    if (row) return { ...row, register: dataset };
  }
  return null;
}

function leboncoinPin(rawHtml: string): { lat: number; lng: number } | null {
  const match =
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
      rawHtml,
    );
  if (!match?.[1]) return null;
  const payload = JSON.parse(match[1]) as {
    props?: {
      pageProps?: { ad?: { location?: { lat?: number; lng?: number } } };
    };
  };
  const location = payload.props?.pageProps?.ad?.location;
  if (typeof location?.lat !== 'number' || typeof location.lng !== 'number') {
    return null;
  }
  return { lat: location.lat, lng: location.lng };
}

function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * radians) *
      Math.cos(b.lat * radians) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.asin(Math.sqrt(h)));
}

function sameAddress(left: string, right: string): boolean {
  const a = normalizeAddress(left);
  const b = normalizeAddress(right);
  return a.length > 0 && b.length > 0 && (a === b || a.startsWith(b));
}

async function benchmark(url: string) {
  const answer = await askPrecisement(url);
  const theirs = (answer?.data ?? []).filter((c) => c.discarded_by === null);

  const extracted = await extractListing(
    { url },
    { scraper: cachedScraper, extractor: cachedExtractor },
  );
  const page = readCache<Page>(cachePath('page', url));
  const pin = page ? leboncoinPin(page.rawHtml) : null;

  const ours = extracted.isOk()
    ? await findAddressCandidates({ listing: extracted.value })
    : null;

  const ourCandidates =
    ours?.isOk() === true
      ? ours.value.candidates.map((c) => ({
          address: c.record.address,
          dpeNumber: c.record.dpeNumber,
          confidence: Math.round(c.confidence * 100),
          matched: c.matched,
          diverged: c.diverged,
          surface: c.record.surfaceM2,
          dpe: c.record.dpeClass,
          ges: c.record.gesClass,
          kwh: c.record.dpeKwhM2Year,
          point: c.record.point,
        }))
      : [];

  const theirTop = theirs[0] ?? null;
  const ourTop = ourCandidates[0] ?? null;
  const ourRankOfTheirTop =
    theirTop === null
      ? null
      : ourCandidates.findIndex((c) =>
          sameAddress(c.address, theirTop.address),
        ) + 1 || null;
  const theirRankOfOurTop =
    ourTop === null
      ? null
      : theirs.findIndex((c) => sameAddress(c.address, ourTop.address)) + 1 ||
        null;

  const theirTopRow =
    theirTop?.dpe != null ? await ademeRowByNumber(theirTop.dpe) : null;

  return {
    url,
    pin,
    precisement: {
      listing: answer?.meta?.listing ?? null,
      notices: answer?.meta?.notices?.map((n) => n.code) ?? [],
      candidates: theirs.map((c) => ({
        address: c.address,
        score: c.score,
        dpe: c.dpe,
        origin: c.origin,
        surface: c.surface,
        dpeLabel: c.dpe_label,
        gesLabel: c.ges_label,
        designatedBy: c.designated_by,
        metresFromPin: pin && c.geo ? metresBetween(pin, c.geo) : null,
      })),
      topAdemeRow: theirTopRow,
    },
    ours: {
      error: extracted.isErr()
        ? `extract: ${extracted.error.message}`
        : ours?.isErr()
          ? `match: ${ours.error.message}`
          : null,
      fields: extracted.isOk() ? extracted.value.fields : null,
      sources: extracted.isOk() ? extracted.value.sources : null,
      refusedFor: ours?.isOk() ? ours.value.refusedFor : null,
      inspected: ours?.isOk() ? ours.value.inspected : 0,
      candidates: ourCandidates,
    },
    comparison: {
      theirTop: theirTop?.address ?? null,
      theirTopScore: theirTop?.score ?? null,
      ourTop: ourTop?.address ?? null,
      ourTopConfidence: ourTop?.confidence ?? null,
      sameTop:
        theirTop !== null &&
        ourTop !== null &&
        sameAddress(ourTop.address, theirTop.address),
      ourRankOfTheirTop,
      theirRankOfOurTop,
    },
  };
}

describe.skipIf(!existsSync(URLS_PATH))('precisement.fr benchmark', () => {
  it('compares our answers with precisement on the same listings', {
    timeout: 3_600_000,
  }, async () => {
    const urls = readFileSync(URLS_PATH, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
    expect(urls.length).toBeGreaterThan(0);

    // why: one flaky socket used to abort a half-hour run. A listing that
    // still fails after a retry is reported, never silently dropped.
    mkdirSync(path.dirname(DUMP_PATH), { recursive: true });
    mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    const results: Awaited<ReturnType<typeof benchmark>>[] = [];
    const failures: string[] = [];
    for (const url of urls) {
      const outcome = await benchmark(url)
        .catch(() => benchmark(url))
        .catch((e: unknown) => {
          failures.push(
            `${url}: ${e instanceof Error ? e.message : 'unknown'}`,
          );
          return null;
        });
      if (outcome !== null) results.push(outcome);
      writeFileSync(DUMP_PATH, JSON.stringify(results, null, 1), 'utf8');
    }

    const withTheirs = results.filter((r) => r.comparison.theirTop !== null);
    const sameTop = withTheirs.filter((r) => r.comparison.sameTop);
    const inOurList = withTheirs.filter(
      (r) => r.comparison.ourRankOfTheirTop !== null,
    );
    const report = [
      '',
      `listings                     : ${results.length}`,
      `precisement answers          : ${withTheirs.length}`,
      `same #1                      : ${sameTop.length}/${withTheirs.length}`,
      `their #1 in our shortlist    : ${inOurList.length}/${withTheirs.length}`,
      `we answer                    : ${results.filter((r) => r.comparison.ourTop !== null).length}`,
      ...failures.map((failure) => `failed                       : ${failure}`),
      '',
      ...results.map((r) => {
        const c = r.comparison;
        return [
          `${r.url.split('/').pop()}`,
          `  them : ${c.theirTop ?? '-'} (${c.theirTopScore ?? '-'})`,
          `  us   : ${c.ourTop ?? '-'} (${c.ourTopConfidence ?? '-'})` +
            (r.ours.error ? ` [${r.ours.error}]` : '') +
            (r.ours.refusedFor ? ` [${r.ours.refusedFor}]` : ''),
          `  their #1 at our rank: ${c.ourRankOfTheirTop ?? '-'}  our #1 at their rank: ${c.theirRankOfOurTop ?? '-'}`,
        ].join('\n');
      }),
      '',
    ].join('\n');
    writeFileSync(REPORT_PATH, report, 'utf8');
    // eslint-disable-next-line no-console
    console.log(report);
  });
});
