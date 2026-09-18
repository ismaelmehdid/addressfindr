import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({ NODE_ENV: 'test', VERCEL_ENV: 'development' }),
}));

import { externalApi, forbidden, validation } from '@/core/errors';
import type { IUrlFetcherClient } from '@/core/url-fetch/ports/url-fetcher-client.port';
import { fetchUrl } from './fetch-url';

function mockFetcher(impl: IUrlFetcherClient['fetch']): IUrlFetcherClient {
  return { fetch: impl };
}

describe('fetchUrl', () => {
  it('rejects empty url', async () => {
    const result = await fetchUrl(
      { url: '' },
      mockFetcher(async () => ok(stub())),
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });

  it('propagates forbidden errors from client (private network)', async () => {
    const result = await fetchUrl(
      { url: 'https://internal.host/' },
      mockFetcher(async () =>
        err(forbidden('URL hostname resolves to a private address')),
      ),
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('forbidden');
  });

  it('propagates validation errors (bad mime)', async () => {
    const result = await fetchUrl(
      { url: 'https://example.com/img.png' },
      mockFetcher(async () =>
        err(validation('Unsupported media type', 'mediaType')),
      ),
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });

  it('returns fetched content on success', async () => {
    const result = await fetchUrl(
      { url: 'https://example.com/' },
      mockFetcher(async () => ok(stub('<html><body>hi</body></html>'))),
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.text).toContain('hi');
  });

  it('passes URL to client', async () => {
    let received: string | null = null;
    await fetchUrl(
      { url: 'https://example.com/path' },
      mockFetcher(async (input) => {
        received = input.url;
        return ok(stub());
      }),
    );
    expect(received).toBe('https://example.com/path');
  });

  it('surfaces external_api errors', async () => {
    const result = await fetchUrl(
      { url: 'https://example.com/' },
      mockFetcher(async () => err(externalApi('url-fetcher', 'HTTP 503'))),
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });
});

function stub(text = ''): {
  url: string;
  finalUrl: string;
  mediaType: string;
  text: string;
  sizeBytes: number;
  truncated: boolean;
} {
  return {
    url: 'https://example.com/',
    finalUrl: 'https://example.com/',
    mediaType: 'text/html',
    text,
    sizeBytes: text.length,
    truncated: false,
  };
}
