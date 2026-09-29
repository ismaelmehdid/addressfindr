import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/env', () => ({
  env: () => ({ NODE_ENV: 'test', VERCEL_ENV: 'development' }),
}));
vi.mock(
  '@/infra/external-apis/google-street-view/google-street-view-imagery',
  () => ({
    googleStreetViewImagery: { imageToward: vi.fn(), panoramaNear: vi.fn() },
  }),
);

import type { IStreetViewImagery } from '@/core/street-view/ports/street-view-imagery.port';
import type { NearestPanorama } from '@/core/street-view/types';
import { getStreetViewPanorama } from './get-street-view-panorama';

function imagery(found: NearestPanorama | null): IStreetViewImagery & {
  panoramaNear: ReturnType<typeof vi.fn>;
} {
  return {
    imageToward: vi.fn(async () => ok(null)),
    panoramaNear: vi.fn(async () => ok(found)),
  };
}

describe('getStreetViewPanorama', () => {
  it('names the panorama and faces the point from where its camera stands', async () => {
    const fake = imagery({
      panoId: 'CAoSLEFGMVFpcE1',
      location: { latitude: 45.7573, longitude: 4.8652 },
    });

    const result = await getStreetViewPanorama(
      { lat: '45.757100', lon: '4.865200' },
      { imagery: fake },
    );

    expect(fake.panoramaNear).toHaveBeenCalledWith({
      latitude: 45.7571,
      longitude: 4.8652,
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({ panoId: 'CAoSLEFGMVFpcE1', heading: 180 });
  });

  it('answers null when no panorama exists near the point', async () => {
    const result = await getStreetViewPanorama(
      { lat: '45.757100', lon: '4.865200' },
      { imagery: imagery(null) },
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toBeNull();
  });

  it('refuses a point outside metropolitan France without calling out', async () => {
    const fake = imagery(null);

    const result = await getStreetViewPanorama(
      { lat: '-21.115141', lon: '55.536384' },
      { imagery: fake },
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('validation');
    expect(fake.panoramaNear).not.toHaveBeenCalled();
  });
});
