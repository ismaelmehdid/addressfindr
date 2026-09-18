import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({ NODE_ENV: 'test', VERCEL_ENV: 'development' }),
}));

import { externalApi } from '@/core/errors';
import type { IWebSearchClient } from '@/core/web-search/ports/web-search-client.port';
import { searchWeb } from './search-web';

function mockClient(impl: IWebSearchClient['search']): IWebSearchClient {
  return { search: impl };
}

describe('searchWeb', () => {
  it('rejects empty queries', async () => {
    const result = await searchWeb(
      { query: '', count: 5 },
      mockClient(async () => ok([])),
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('validation');
  });

  it('rejects count above max', async () => {
    const result = await searchWeb(
      { query: 'x', count: 100 },
      mockClient(async () => ok([])),
    );
    expect(result.isErr()).toBe(true);
  });

  it('passes parsed query/count to client', async () => {
    let received: unknown = null;
    await searchWeb(
      { query: 'quarterly sales 2024', count: 3 },
      mockClient(async (input) => {
        received = input;
        return ok([]);
      }),
    );
    expect(received).toEqual({ query: 'quarterly sales 2024', count: 3 });
  });

  it('returns client results on success', async () => {
    const result = await searchWeb(
      { query: 'x', count: 5 },
      mockClient(async () =>
        ok([
          { title: 'A', url: 'https://a.example/', description: 'a' },
          { title: 'B', url: 'https://b.example/', description: 'b' },
        ]),
      ),
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.length).toBe(2);
  });

  it('propagates client errors', async () => {
    const result = await searchWeb(
      { query: 'x', count: 5 },
      mockClient(async () => err(externalApi('brave-search', 'down'))),
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });
});
