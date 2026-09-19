import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({
    NODE_ENV: 'test',
    VERCEL_ENV: 'development',
    FIRECRAWL_API_KEY: 'fc-test',
    FIRECRAWL_TIMEOUT_MS: 60000,
  }),
}));

import { firecrawlScraperAdapter } from './firecrawl-scraper-adapter';

function mockFetchOnce(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('firecrawlScraperAdapter', () => {
  it('rejects a url whose domain is not a known portal', async () => {
    mockFetchOnce({ success: true });
    const result = await firecrawlScraperAdapter.scrape({
      url: 'https://example.com/annonce/1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });

  it('rejects a non-https url', async () => {
    mockFetchOnce({ success: true });
    const result = await firecrawlScraperAdapter.scrape({
      url: 'http://www.pap.fr/annonces/1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });

  it('returns markdown and rawHtml on success', async () => {
    mockFetchOnce({
      success: true,
      data: {
        markdown: '# Annonce',
        rawHtml: '<html></html>',
        metadata: { url: 'https://www.pap.fr/annonces/1' },
      },
    });
    const result = await firecrawlScraperAdapter.scrape({
      url: 'https://www.pap.fr/annonces/1',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.markdown).toBe('# Annonce');
      expect(result.value.rawHtml).toBe('<html></html>');
    }
  });

  it('maps an http error to external_api', async () => {
    mockFetchOnce({ success: false, error: 'boom' }, 500);
    const result = await firecrawlScraperAdapter.scrape({
      url: 'https://www.pap.fr/annonces/1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });

  it('maps an empty payload to external_api', async () => {
    mockFetchOnce({ success: true, data: { markdown: '', rawHtml: '' } });
    const result = await firecrawlScraperAdapter.scrape({
      url: 'https://www.pap.fr/annonces/1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });
});
