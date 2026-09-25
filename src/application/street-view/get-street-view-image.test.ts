import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/env', () => ({
  env: () => ({ NODE_ENV: 'test', VERCEL_ENV: 'development' }),
}));
vi.mock(
  '@/infra/external-apis/google-street-view/google-street-view-imagery',
  () => ({ googleStreetViewImagery: { imageToward: vi.fn() } }),
);

import type { IStreetViewImagery } from '@/core/street-view/ports/street-view-imagery.port';
import { getStreetViewImage } from './get-street-view-image';

function imagery(): IStreetViewImagery & {
  imageToward: ReturnType<typeof vi.fn>;
} {
  return { imageToward: vi.fn(async () => ok(null)) };
}

describe('getStreetViewImage', () => {
  it('asks the imagery for the parsed point', async () => {
    const fake = imagery();

    const result = await getStreetViewImage(
      { lat: '45.757100', lon: '4.865200' },
      { imagery: fake },
    );

    expect(result.isOk()).toBe(true);
    expect(fake.imageToward).toHaveBeenCalledWith({
      latitude: 45.7571,
      longitude: 4.8652,
    });
  });

  // why: every image is billed; a point the UI cannot have sent must never
  // reach Google.
  it('refuses a point outside metropolitan France without calling out', async () => {
    const fake = imagery();

    const result = await getStreetViewImage(
      { lat: '-21.115141', lon: '55.536384' },
      { imagery: fake },
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('validation');
    expect(fake.imageToward).not.toHaveBeenCalled();
  });

  it('refuses a coordinate that is not a decimal degree', async () => {
    const fake = imagery();

    const result = await getStreetViewImage(
      { lat: '45.7571,4.8652', lon: '4.8652' },
      { imagery: fake },
    );

    expect(result.isErr()).toBe(true);
    expect(fake.imageToward).not.toHaveBeenCalled();
  });
});
