import { afterEach, describe, expect, it, vi } from 'vitest';

const environment = vi.hoisted(() => ({
  GOOGLE_MAPS_API_KEY: 'test-key' as string | undefined,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/shared/env', () => ({
  env: () => ({
    NODE_ENV: 'test',
    VERCEL_ENV: 'development',
    GOOGLE_MAPS_API_KEY: environment.GOOGLE_MAPS_API_KEY,
    GOOGLE_STREET_VIEW_BASE_URL:
      'https://maps.googleapis.com/maps/api/streetview',
    GOOGLE_STREET_VIEW_TIMEOUT_MS: 8000,
  }),
}));

import { googleStreetViewImagery } from './google-street-view-imagery';

const LYON_3E = { latitude: 45.7571, longitude: 4.8652 };

function metadata(status: string, httpStatus = 200): Response {
  return new Response(JSON.stringify({ status }), { status: httpStatus });
}

const PANORAMA_METADATA = {
  status: 'OK',
  pano_id: 'CAoSLEFGMVFpcE1',
  location: { lat: 45.75725, lng: 4.86535 },
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function jpeg(): Response {
  return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  environment.GOOGLE_MAPS_API_KEY = 'test-key';
});

describe('googleStreetViewImagery.imageToward', () => {
  it('returns the image when a panorama exists near the point', async () => {
    const spy = vi
      .fn<(url: URL) => Promise<Response>>()
      .mockResolvedValueOnce(metadata('OK'))
      .mockResolvedValueOnce(jpeg());
    vi.stubGlobal('fetch', spy);

    const result = await googleStreetViewImagery.imageToward(LYON_3E);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value?.contentType).toBe('image/jpeg');
    expect(result.value?.bytes.byteLength).toBe(3);

    const imageUrl = spy.mock.calls[1]?.[0];
    expect(imageUrl?.searchParams.get('location')).toBe('45.7571,4.8652');
    expect(imageUrl?.searchParams.get('source')).toBe('outdoor');
    expect(imageUrl?.searchParams.get('heading')).toBeNull();
  });

  // why: metadata is free, the image is billed. Without a panorama, no image
  // may be requested.
  it('asks for no image when no panorama exists', async () => {
    const spy = vi.fn(async () => metadata('ZERO_RESULTS'));
    vi.stubGlobal('fetch', spy);

    const result = await googleStreetViewImagery.imageToward(LYON_3E);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reports a refused key as an external failure, not as missing imagery', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => metadata('REQUEST_DENIED')),
    );

    const result = await googleStreetViewImagery.imageToward(LYON_3E);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('external_api');
  });

  it('treats an image 404 as missing imagery', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<() => Promise<Response>>()
        .mockResolvedValueOnce(metadata('OK'))
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    );

    const result = await googleStreetViewImagery.imageToward(LYON_3E);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toBeNull();
  });

  it('never calls Google without a key', async () => {
    environment.GOOGLE_MAPS_API_KEY = undefined;
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    const result = await googleStreetViewImagery.imageToward(LYON_3E);

    expect(result.isErr()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('turns a network failure into an external failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    const result = await googleStreetViewImagery.imageToward(LYON_3E);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('external_api');
  });
});

describe('googleStreetViewImagery.panoramaNear', () => {
  it('names the panorama the photo is taken from, with the same search', async () => {
    const spy = vi
      .fn<(url: URL) => Promise<Response>>()
      .mockResolvedValueOnce(json(PANORAMA_METADATA));
    vi.stubGlobal('fetch', spy);

    const result = await googleStreetViewImagery.panoramaNear(LYON_3E);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({
      panoId: 'CAoSLEFGMVFpcE1',
      location: { latitude: 45.75725, longitude: 4.86535 },
    });
    expect(spy).toHaveBeenCalledOnce();
    const url = spy.mock.calls[0]?.[0];
    expect(url?.pathname).toBe('/maps/api/streetview/metadata');
    expect(url?.searchParams.get('location')).toBe('45.7571,4.8652');
    expect(url?.searchParams.get('radius')).toBe('50');
    expect(url?.searchParams.get('source')).toBe('outdoor');
  });

  it('answers null when no panorama exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => metadata('ZERO_RESULTS')),
    );

    const result = await googleStreetViewImagery.panoramaNear(LYON_3E);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toBeNull();
  });

  it('refuses an OK answer that names no panorama', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ ...PANORAMA_METADATA, pano_id: '' })),
    );

    const result = await googleStreetViewImagery.panoramaNear(LYON_3E);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('external_api');
  });

  it('never calls Google without a key', async () => {
    environment.GOOGLE_MAPS_API_KEY = undefined;
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    const result = await googleStreetViewImagery.panoramaNear(LYON_3E);

    expect(result.isErr()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

// why: the photo needs only the status; a garbled panorama field must not
// cost the card its photo.
it('still returns the photo when the metadata garbles the panorama fields', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(
        json({ status: 'OK', pano_id: 42, location: 'nowhere' }),
      )
      .mockResolvedValueOnce(jpeg()),
  );

  const result = await googleStreetViewImagery.imageToward(LYON_3E);

  expect(result.isOk()).toBe(true);
  if (!result.isOk()) return;
  expect(result.value?.contentType).toBe('image/jpeg');
});
