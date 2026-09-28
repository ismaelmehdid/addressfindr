import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSearchId,
  sendDetailRequest,
  sendVerdict,
} from './use-search-feedback';

const SEARCH_ID = '3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f';
const OTHER_SEARCH_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const CONFIRMATION: Parameters<typeof sendVerdict>[0] = {
  searchId: SEARCH_ID,
  listingUrl: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3012345678',
  verdict: 'confirmed',
  confirmedDpeNumber: '2269E0123456X',
  candidates: [
    { dpeNumber: '2269E0123456X', score: 0.92 },
    { dpeNumber: '2269E0654321Y', score: 0.81 },
  ],
};

const DETAIL: Parameters<typeof sendDetailRequest>[0] = {
  searchId: SEARCH_ID,
  reason: 'wrong_commune',
  comment: 'Melesse, not Rennes',
};

function answerWith(body: object, status = 200): ReturnType<typeof vi.fn> {
  const spy = vi.fn(
    async (): Promise<Response> =>
      new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function failNetwork(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (): Promise<Response> => {
      throw new TypeError('Failed to fetch');
    }),
  );
}

function stubCryptoWithoutRandomUuid(fill: (bytes: Uint8Array) => void): void {
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array): Uint8Array => {
      fill(bytes);
      return bytes;
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendVerdict', () => {
  it('posts the verdict as JSON to the feedback route', async () => {
    const spy = answerWith({ searchId: SEARCH_ID, verdict: 'confirmed' });

    await sendVerdict(CONFIRMATION);

    expect(spy).toHaveBeenCalledWith('/api/listings/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(CONFIRMATION),
    });
  });

  it('succeeds when the receipt echoes the search id and the verdict', async () => {
    answerWith({ searchId: SEARCH_ID, verdict: 'confirmed' });

    expect(await sendVerdict(CONFIRMATION)).toBe(true);
  });

  it('fails when the receipt names another search', async () => {
    answerWith({ searchId: OTHER_SEARCH_ID, verdict: 'confirmed' });

    expect(await sendVerdict(CONFIRMATION)).toBe(false);
  });

  it('fails when the receipt names another verdict', async () => {
    answerWith({ searchId: SEARCH_ID, verdict: 'none_match' });

    expect(await sendVerdict(CONFIRMATION)).toBe(false);
  });

  it('fails when the route answers with an error status', async () => {
    answerWith(
      { error: { code: 'CONFLICT', message: 'Another verdict exists' } },
      409,
    );

    expect(await sendVerdict(CONFIRMATION)).toBe(false);
  });

  it('fails when the request never reaches the route', async () => {
    failNetwork();

    expect(await sendVerdict(CONFIRMATION)).toBe(false);
  });
});

describe('sendDetailRequest', () => {
  it('posts the detail as JSON to the detail route', async () => {
    const spy = answerWith({ searchId: SEARCH_ID });

    await sendDetailRequest(DETAIL);

    expect(spy).toHaveBeenCalledWith('/api/listings/feedback/detail', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(DETAIL),
    });
  });

  it('succeeds when the receipt echoes the search id', async () => {
    answerWith({ searchId: SEARCH_ID });

    expect(await sendDetailRequest(DETAIL)).toBe(true);
  });

  it('fails when the receipt names another search', async () => {
    answerWith({ searchId: OTHER_SEARCH_ID });

    expect(await sendDetailRequest(DETAIL)).toBe(false);
  });

  it('fails when the route answers with an error status', async () => {
    answerWith(
      { error: { code: 'NOT_FOUND', message: 'No none_match verdict' } },
      404,
    );

    expect(await sendDetailRequest(DETAIL)).toBe(false);
  });

  it('fails when the request never reaches the route', async () => {
    failNetwork();

    expect(await sendDetailRequest(DETAIL)).toBe(false);
  });
});

describe('createSearchId', () => {
  it('uses crypto.randomUUID when the browser offers it', () => {
    vi.stubGlobal('crypto', { randomUUID: (): string => SEARCH_ID });

    expect(createSearchId()).toBe(SEARCH_ID);
  });

  it('builds a v4 UUID from random bytes when randomUUID is missing', () => {
    const webCrypto = globalThis.crypto;
    stubCryptoWithoutRandomUuid((bytes) => {
      webCrypto.getRandomValues(bytes);
    });

    const ids = Array.from({ length: 50 }, createSearchId);

    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sets the version and variant bits whatever the random bytes', () => {
    stubCryptoWithoutRandomUuid((bytes) => {
      bytes.fill(0x00);
    });
    expect(createSearchId()).toBe('00000000-0000-4000-8000-000000000000');

    stubCryptoWithoutRandomUuid((bytes) => {
      bytes.fill(0xff);
    });
    expect(createSearchId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
