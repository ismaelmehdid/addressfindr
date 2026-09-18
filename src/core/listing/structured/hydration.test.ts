import { describe, expect, it } from 'vitest';
import { extractHydrationPayload } from './hydration';

describe('extractHydrationPayload', () => {
  it('reads a __NEXT_DATA__ script', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{"props":{"ok":true}}</script>`;
    expect(extractHydrationPayload(html)).toEqual({ props: { ok: true } });
  });

  it('reads a window.__NUXT__ assignment', () => {
    const html = `<script>window.__NUXT__={"data":[{"area":68}]}</script>`;
    expect(extractHydrationPayload(html)).toEqual({ data: [{ area: 68 }] });
  });

  it('returns null when no payload is present', () => {
    expect(extractHydrationPayload('<html></html>')).toBeNull();
  });

  it('returns null on malformed json instead of throwing', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{ oops </script>`;
    expect(extractHydrationPayload(html)).toBeNull();
  });
});
