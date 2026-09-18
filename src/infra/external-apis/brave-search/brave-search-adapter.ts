import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { type AppError, externalApi, unauthorized } from '@/core/errors';
import type { IWebSearchClient } from '@/core/web-search/ports/web-search-client.port';
import type { WebSearchQuery, WebSearchResult } from '@/core/web-search/types';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const PROVIDER = 'brave-search';
const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const REQUEST_TIMEOUT_MS = 8000;

const BraveResultSchema = v.object({
  title: v.string(),
  url: v.pipe(v.string(), v.url()),
  description: v.optional(v.string(), ''),
});

const BraveResponseSchema = v.object({
  web: v.optional(
    v.object({
      results: v.optional(v.array(BraveResultSchema), []),
    }),
  ),
});

async function search(
  input: WebSearchQuery,
): Promise<Result<WebSearchResult[], AppError>> {
  const apiKey = env().BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return err(unauthorized('Brave Search API key not configured'));
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set('q', input.query);
  url.searchParams.set('count', String(input.count));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  log.info('brave-search.request', {
    queryLength: input.query.length,
    count: input.count,
  });

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'accept-encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.warn('brave-search.http_failure', {
        status: res.status,
        body: body.slice(0, 200),
      });
      if (res.status === 401 || res.status === 403) {
        return err(unauthorized('Brave Search rejected the API key'));
      }
      return err(externalApi(PROVIDER, `HTTP ${res.status}`));
    }

    const json = await res.json();
    const parsed = v.safeParse(BraveResponseSchema, json);
    if (!parsed.success) {
      log.warn('brave-search.parse_failure', {
        issues: parsed.issues.map((i) => i.message).slice(0, 3),
      });
      return err(externalApi(PROVIDER, 'Unexpected response shape'));
    }

    const results = parsed.output.web?.results ?? [];
    log.info('brave-search.success', { count: results.length });
    return ok(
      results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description,
      })),
    );
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return err(externalApi(PROVIDER, 'Request timed out'));
    }
    log.error('brave-search.exception', e);
    return err(externalApi(PROVIDER, 'Network or parser failure'));
  } finally {
    clearTimeout(timeout);
  }
}

export const braveSearchAdapter: IWebSearchClient = { search };
