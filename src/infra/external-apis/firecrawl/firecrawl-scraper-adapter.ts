import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { type AppError, externalApi, validation } from '@/core/errors';
import { resolvePortal } from '@/core/listing/portal-registry';
import type {
  IListingScraper,
  ScrapedPage,
} from '@/core/listing/ports/listing-scraper.port';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';
import { FirecrawlScrapeResponseSchema } from './schemas';

const PROVIDER = 'firecrawl';
const ENDPOINT = 'https://api.firecrawl.dev/v2/scrape';

async function scrape(input: {
  url: string;
}): Promise<Result<ScrapedPage, AppError>> {
  const apiKey = env().FIRECRAWL_API_KEY;
  if (!apiKey) {
    return err(externalApi(PROVIDER, 'FIRECRAWL_API_KEY is not configured'));
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.url);
  } catch {
    return err(validation('Invalid listing url', 'url'));
  }
  if (parsedUrl.protocol !== 'https:') {
    return err(validation('Listing url must be https', 'url'));
  }

  // why: allowlist de domaines — on ne scrape jamais un domaine arbitraire (SSRF)
  const portal = resolvePortal(parsedUrl.hostname);
  if (!portal) {
    return err(validation('Unsupported listing portal', 'url'));
  }

  const timeoutMs = env().FIRECRAWL_TIMEOUT_MS;
  log.info('listing.scrape.start', { portal });

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        url: parsedUrl.toString(),
        formats: ['markdown', 'rawHtml'],
        onlyMainContent: false,
        timeout: timeoutMs,
      }),
      signal: AbortSignal.timeout(timeoutMs + 5000),
    });
  } catch (e) {
    log.warn('listing.scrape.failed', {
      portal,
      reason: e instanceof Error ? e.name : 'network',
    });
    return err(externalApi(PROVIDER, 'Listing page is unreachable'));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return err(externalApi(PROVIDER, 'Firecrawl returned a non-JSON body'));
  }

  const parsed = v.safeParse(FirecrawlScrapeResponseSchema, body);
  if (!parsed.success) {
    return err(externalApi(PROVIDER, 'Unexpected Firecrawl response shape'));
  }
  if (!response.ok || !parsed.output.success || !parsed.output.data) {
    log.warn('listing.scrape.failed', { portal, status: response.status });
    return err(
      externalApi(PROVIDER, parsed.output.error ?? `HTTP ${response.status}`),
    );
  }

  const { markdown, rawHtml, metadata } = parsed.output.data;
  if (markdown.length === 0 && rawHtml.length === 0) {
    return err(externalApi(PROVIDER, 'Listing page returned no content'));
  }

  log.info('listing.scrape.success', {
    portal,
    markdownChars: markdown.length,
    htmlChars: rawHtml.length,
  });

  return ok({
    markdown,
    rawHtml,
    finalUrl: metadata.url ?? metadata.sourceURL ?? parsedUrl.toString(),
  });
}

export const firecrawlScraperAdapter: IListingScraper = { scrape };
