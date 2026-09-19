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

function mockFetchRejectingWith(error: Error) {
  const spy = vi.fn(async () => {
    throw error;
  });
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

  it('maps an anti-bot challenge to external_api', async () => {
    mockFetchOnce({
      success: true,
      data: {
        markdown: 'Vérification… geo.captcha-delivery.com',
        rawHtml: '<html></html>',
        metadata: { statusCode: 403 },
      },
    });
    const result = await firecrawlScraperAdapter.scrape({
      url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });

  // why: AbortSignal.timeout() rend un TimeoutError, distinct d'un AbortError —
  // un budget epuise doit rester distinguable d'un portail injoignable dans
  // les logs, plutot que d'etre replie sur le meme message generique.
  it('reports a distinct message when the request times out', async () => {
    const timeoutError = new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );
    mockFetchRejectingWith(timeoutError);
    const result = await firecrawlScraperAdapter.scrape({
      url: 'https://www.pap.fr/annonces/1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('external_api');
      expect(result.error.message).toBe(
        'Listing page took too long to respond',
      );
    }
  });

  it('reports the generic unreachable message on a plain network failure', async () => {
    mockFetchRejectingWith(new TypeError('fetch failed'));
    const result = await firecrawlScraperAdapter.scrape({
      url: 'https://www.pap.fr/annonces/1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('external_api');
      expect(result.error.message).toBe('Listing page is unreachable');
    }
  });

  it('does not treat a full page carrying an anti-bot script as blocked', async () => {
    mockFetchOnce({
      success: true,
      data: {
        markdown: `${'Duplex 4 pièces 102 m² '.repeat(60)} datadome`,
        rawHtml: '<html></html>',
        metadata: { statusCode: 200 },
      },
    });
    const result = await firecrawlScraperAdapter.scrape({
      url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/1',
    });
    expect(result.isOk()).toBe(true);
  });
});
