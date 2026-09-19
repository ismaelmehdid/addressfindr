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

// why: le helper rend l'espion pour que les cas de rejet puissent prouver
// qu'AUCUNE requete n'est partie — une assertion sur l'erreur retournee
// n'etablit pas l'allowlist SSRF, seulement sa forme
function mockFetchOnce(body: unknown, status = 200) {
  const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('firecrawlScraperAdapter', () => {
  it('rejects a url whose domain is not a known portal, without calling out', async () => {
    const spy = mockFetchOnce({ success: true });
    const result = await firecrawlScraperAdapter.scrape({
      url: 'https://example.com/annonce/1',
    });
    expect(spy).not.toHaveBeenCalled();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });

  it('is not fooled by a host that merely contains an allowed domain', async () => {
    const spy = mockFetchOnce({ success: true });
    const result = await firecrawlScraperAdapter.scrape({
      url: 'https://evil-leboncoin.fr/annonce/1',
    });
    expect(spy).not.toHaveBeenCalled();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });

  it('rejects a non-https url, without calling out', async () => {
    const spy = mockFetchOnce({ success: true });
    const result = await firecrawlScraperAdapter.scrape({
      url: 'http://www.pap.fr/annonces/1',
    });
    expect(spy).not.toHaveBeenCalled();
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
