import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadDotEnv } from '../../../test/load-env';

loadDotEnv();

const { rankOfTrueAddress, rankOfTrueStreet } = await import(
  '@/core/ademe/address-identity'
);
const { extractListing } = await import(
  '@/application/listing/extract-listing'
);
const { findAddressCandidates } = await import('./find-address-candidates');

// why: pap.fr publie streetAddress en JSON-LD. C'est la seule verite terrain
// gratuite du projet : on extrait l'annonce, on retire l'adresse, on fait
// tourner le matching, et on regarde a quel rang la vraie adresse ressort.
// Le reste du pipeline ne lit jamais streetAddress — ni buildDpeSearch ni le
// scoring — donc la retirer ne biaise rien, elle evite juste toute fuite.
const PAP_SEARCH_URL =
  'https://www.pap.fr/annonce/vente-appartements-lyon-3e-69003-g439';
const LISTING_URL_PATTERN = /https:\/\/www\.pap\.fr\/annonces\/[a-z0-9-]+r\d+/g;
const MAX_LISTINGS = Number.parseInt(process.env.EVAL_MAX_LISTINGS ?? '6', 10);
const REPORT_PATH = process.env.EVAL_REPORT_PATH ?? 'eval-address-report.txt';

type Outcome = {
  url: string;
  trueAddress: string | null;
  rank: number | null;
  streetRank: number | null;
  shortlist: number;
  inspected: number;
  truncated: boolean;
  note: string;
};

const harvestDiagnostics: string[] = [];

async function harvestListingUrls(): Promise<string[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    harvestDiagnostics.push('FIRECRAWL_API_KEY absente de .env');
    return [];
  }

  const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      url: PAP_SEARCH_URL,
      formats: ['markdown', 'rawHtml'],
      onlyMainContent: false,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    harvestDiagnostics.push(
      `firecrawl HTTP ${response.status}: ${body.slice(0, 300)}`,
    );
    return [];
  }

  const body = (await response.json()) as {
    data?: { markdown?: string; rawHtml?: string };
  };
  const haystack = `${body.data?.markdown ?? ''}${body.data?.rawHtml ?? ''}`;
  const urls = [...new Set(haystack.match(LISTING_URL_PATTERN) ?? [])];
  harvestDiagnostics.push(
    `firecrawl 200, ${haystack.length} caracteres, ${urls.length} annonces`,
  );
  return urls.slice(0, MAX_LISTINGS);
}

async function evaluateListing(url: string): Promise<Outcome> {
  const absent: Outcome = {
    url,
    trueAddress: null,
    rank: null,
    streetRank: null,
    shortlist: 0,
    inspected: 0,
    truncated: false,
    note: '',
  };

  const extracted = await extractListing({ url });
  if (extracted.isErr()) {
    return { ...absent, note: `extraction: ${extracted.error.message}` };
  }

  const trueAddress = extracted.value.fields.streetAddress;
  if (trueAddress === null) {
    return { ...absent, note: 'pas de streetAddress dans le JSON-LD' };
  }

  const blinded = {
    ...extracted.value,
    fields: { ...extracted.value.fields, streetAddress: null },
  };

  const matched = await findAddressCandidates({ listing: blinded });
  if (matched.isErr()) {
    return {
      ...absent,
      trueAddress,
      note: `matching: ${matched.error.message}`,
    };
  }

  const { rank } = rankOfTrueAddress({
    candidates: matched.value.candidates,
    trueAddress,
  });
  const street = rankOfTrueStreet({
    candidates: matched.value.candidates,
    trueAddress,
  });

  return {
    url,
    trueAddress,
    rank,
    streetRank: street.rank,
    shortlist: matched.value.candidates.length,
    inspected: matched.value.inspected,
    truncated: matched.value.truncated,
    note: matched.value.refusedFor ?? '',
  };
}

describe('verite terrain pap.fr', () => {
  it('mesure a quel rang la vraie adresse ressort', async () => {
    const urls = await harvestListingUrls();
    expect(
      urls.length,
      `aucune annonce pap.fr recoltee — ${harvestDiagnostics.join(' | ')}`,
    ).toBeGreaterThan(0);

    const outcomes: Outcome[] = [];
    for (const url of urls) {
      outcomes.push(await evaluateListing(url));
    }

    const withTruth = outcomes.filter((o) => o.trueAddress !== null);
    const found = withTruth.filter((o) => o.rank !== null);
    const atOne = withTruth.filter((o) => o.rank === 1);
    const streetFound = withTruth.filter((o) => o.streetRank !== null);
    const streetAtOne = withTruth.filter((o) => o.streetRank === 1);
    const truncated = outcomes.filter((o) => o.truncated);
    const refused = outcomes.filter((o) => o.note === 'insufficient-evidence');

    const report = [
      '',
      `annonces evaluees         : ${outcomes.length}`,
      `avec reference            : ${withTruth.length}`,
      '',
      '-- niveau adresse exacte (la reference pap.fr porte rarement le numero)',
      `  trouvee dans la liste   : ${found.length}/${withTruth.length}`,
      `  au rang 1               : ${atOne.length}/${withTruth.length}`,
      '',
      '-- niveau rue (ce que la reference permet reellement de mesurer)',
      `  bonne rue dans la liste : ${streetFound.length}/${withTruth.length}`,
      `  bonne rue au rang 1     : ${streetAtOne.length}/${withTruth.length}`,
      '',
      `refus faute de preuve    : ${refused.length}/${outcomes.length}`,
      `liste tronquee           : ${truncated.length}/${outcomes.length}`,
      '',
      ...outcomes.map(
        (o) =>
          `  adresse=${String(o.rank ?? '-').padStart(2)} ` +
          `rue=${String(o.streetRank ?? '-').padStart(2)} ` +
          `liste=${String(o.shortlist).padStart(2)} ` +
          `evaluees=${String(o.inspected).padStart(4)}` +
          `${o.truncated ? ' TRONQUE' : '        '}  ` +
          `${o.trueAddress ?? '(pas de reference)'}` +
          (o.note.length > 0 ? `  [${o.note}]` : ''),
      ),
      '',
    ].join('\n');
    // why: selon le reporter, vitest avale la sortie console. Le rapport est
    // le produit du harnais, il doit survivre a ca.
    writeFileSync(REPORT_PATH, report, 'utf8');
    // why: ce harnais n'existe que pour produire ce rapport, et il s'invoque a
    // la main. Le fichier en garde une copie, la sortie terminal sert a le
    // lire sans ouvrir quoi que ce soit.
    // eslint-disable-next-line no-console
    console.log(report);

    expect(
      withTruth.length,
      'aucune annonce ne porte de streetAddress',
    ).toBeGreaterThan(0);
  });
});
