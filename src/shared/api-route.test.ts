import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/application/rate-limit/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

import * as v from 'valibot';
import { getCurrentUser } from '@/application/me/get-current-user';
import { applyRateLimit } from '@/application/rate-limit/apply-rate-limit';
import { unauthorized } from '@/core/errors';
import { openRoute, parseJsonBody, requireAuthedRoute } from './api-route';

const mockedUser = vi.mocked(getCurrentUser);
const mockedRateLimit = vi.mocked(applyRateLimit);

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockResolvedValue({ success: true, remaining: 1, reset: 0 });
});

describe('requireAuthedRoute — authz gate', () => {
  it('rejects a signed-out caller', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no session')));

    const result = await requireAuthedRoute({
      rateLimit: 'default',
      event: 'test.event',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  it('allows a signed-in caller', async () => {
    mockedUser.mockResolvedValue(ok({ id: 'user-1' } as never));

    const result = await requireAuthedRoute({
      rateLimit: 'default',
      event: 'test.event',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ctx).toEqual({ userId: 'user-1' });
  });
});

function extractRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://app.test/api/listings/extract', {
    method: 'POST',
    headers,
  });
}

describe('openRoute — anonymous access with a rate limit', () => {
  it('lets a signed-out caller through with a null user id', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no session')));

    const result = await openRoute({
      req: extractRequest({ 'x-forwarded-for': '203.0.113.7' }),
      rateLimit: 'listing-extract',
      event: 'test.event',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.caller).toEqual({ userId: null });
  });

  it('keys the limit on the client address for a signed-out caller', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no session')));

    await openRoute({
      req: extractRequest({ 'x-forwarded-for': '203.0.113.7' }),
      rateLimit: 'listing-extract',
      event: 'test.event',
    });

    expect(mockedRateLimit).toHaveBeenCalledWith({
      identifier: 'ip:203.0.113.7',
      limit: 'listing-extract',
    });
  });

  it('keys the limit on the user id for a signed-in caller', async () => {
    mockedUser.mockResolvedValue(ok({ id: 'user-1' } as never));

    const result = await openRoute({
      req: extractRequest({ 'x-forwarded-for': '203.0.113.7' }),
      rateLimit: 'listing-extract',
      event: 'test.event',
    });

    expect(mockedRateLimit).toHaveBeenCalledWith({
      identifier: 'user-1',
      limit: 'listing-extract',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.caller).toEqual({ userId: 'user-1' });
  });

  it('rejects a signed-out caller over the limit', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no session')));
    mockedRateLimit.mockResolvedValue({
      success: false,
      reason: 'limited',
      reset: 42,
    });

    const result = await openRoute({
      req: extractRequest({ 'x-forwarded-for': '203.0.113.7' }),
      rateLimit: 'listing-extract',
      event: 'test.event',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(429);
    const body = await result.response.json();
    expect(body.error).toBe('rate_limited');
  });
});

describe('openRoute — same-origin check', () => {
  beforeEach(() => {
    mockedUser.mockResolvedValue(err(unauthorized('no session')));
  });

  async function statusFor(headers: Record<string, string>): Promise<number> {
    const result = await openRoute({
      req: extractRequest(headers),
      rateLimit: 'listing-extract',
      event: 'test.event',
    });
    return result.ok ? 200 : result.response.status;
  }

  it('refuses a cross-site request before spending any quota', async () => {
    expect(await statusFor({ 'sec-fetch-site': 'cross-site' })).toBe(403);
    expect(mockedRateLimit).not.toHaveBeenCalled();
  });

  it('refuses a same-site request from a sibling host', async () => {
    expect(await statusFor({ 'sec-fetch-site': 'same-site' })).toBe(403);
  });

  it('accepts a same-origin request', async () => {
    expect(await statusFor({ 'sec-fetch-site': 'same-origin' })).toBe(200);
  });

  it('accepts a request the user typed into the address bar', async () => {
    expect(await statusFor({ 'sec-fetch-site': 'none' })).toBe(200);
  });

  it('trusts Sec-Fetch-Site over a matching Origin', async () => {
    expect(
      await statusFor({
        'sec-fetch-site': 'cross-site',
        origin: 'https://app.test',
      }),
    ).toBe(403);
  });

  it('refuses a mismatched Origin when Sec-Fetch-Site is absent', async () => {
    expect(await statusFor({ origin: 'https://evil.example' })).toBe(403);
    expect(mockedRateLimit).not.toHaveBeenCalled();
  });

  it('refuses an opaque null Origin', async () => {
    expect(await statusFor({ origin: 'null' })).toBe(403);
  });

  it('accepts an Origin that matches the request host', async () => {
    expect(await statusFor({ origin: 'https://app.test' })).toBe(200);
  });

  // why: behind the Vercel proxy the public host arrives in x-forwarded-host,
  // while req.url may carry an internal host.
  it('compares the Origin with the forwarded host first', async () => {
    const req = new Request('http://localhost:3000/api/listings/extract', {
      method: 'POST',
      headers: {
        origin: 'https://www.app.fr',
        'x-forwarded-host': 'www.app.fr',
      },
    });

    const result = await openRoute({
      req,
      rateLimit: 'listing-extract',
      event: 'test.event',
    });

    expect(result.ok).toBe(true);
  });

  it('refuses an Origin that only matches req.url when the forwarded host differs', async () => {
    const req = new Request('https://app.test/api/listings/extract', {
      method: 'POST',
      headers: { origin: 'https://app.test', 'x-forwarded-host': 'www.app.fr' },
    });

    const result = await openRoute({
      req,
      rateLimit: 'listing-extract',
      event: 'test.event',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
  });

  it('accepts a request with neither header, from a non-browser client', async () => {
    expect(await statusFor({})).toBe(200);
    expect(mockedRateLimit).toHaveBeenCalledTimes(1);
  });
});

describe('openRoute — limiter unavailable', () => {
  it('answers 503 when a paid bucket fails closed', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no session')));
    mockedRateLimit.mockResolvedValue({
      success: false,
      reason: 'unavailable',
    });

    const result = await openRoute({
      req: extractRequest(),
      rateLimit: 'listing-extract',
      event: 'test.event',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(503);
    const body = await result.response.json();
    expect(body.error).toBe('service_unavailable');
  });
});

describe('parseJsonBody — media type', () => {
  const Schema = v.object({ url: v.string() });

  function jsonRequest(contentType: string | null): Request {
    return new Request('https://app.test/api/listings/extract', {
      method: 'POST',
      headers: contentType === null ? {} : { 'content-type': contentType },
      body: JSON.stringify({ url: 'https://www.leboncoin.fr/ad/1' }),
    });
  }

  it('refuses a JSON body sent as text/plain with 415', async () => {
    const result = await parseJsonBody(
      jsonRequest('text/plain;charset=UTF-8'),
      Schema,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(415);
    const body = await result.response.json();
    expect(body.error).toBe('unsupported_media_type');
  });

  it('refuses a form-encoded body with 415', async () => {
    const result = await parseJsonBody(
      jsonRequest('application/x-www-form-urlencoded'),
      Schema,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(415);
  });

  it('refuses a body without a content type with 415', async () => {
    const result = await parseJsonBody(jsonRequest(null), Schema);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(415);
  });

  it('refuses a JSON-looking subtype that is not application/json', async () => {
    const result = await parseJsonBody(
      jsonRequest('application/json-patch+json'),
      Schema,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(415);
  });

  it('accepts application/json', async () => {
    const result = await parseJsonBody(jsonRequest('application/json'), Schema);

    expect(result).toEqual({
      ok: true,
      value: { url: 'https://www.leboncoin.fr/ad/1' },
    });
  });

  it('accepts application/json with a charset, in any case', async () => {
    const result = await parseJsonBody(
      jsonRequest('Application/JSON; charset=utf-8'),
      Schema,
    );

    expect(result.ok).toBe(true);
  });
});
