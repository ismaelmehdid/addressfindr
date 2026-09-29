import { describe, expect, it } from 'vitest';
import { headingToward } from './heading-toward';

const PANORAMA = { latitude: 45.7578, longitude: 4.8515 };
// why: about 20 m, the distance between a Street View car and a facade.
const STEP = 0.0002;

describe('headingToward', () => {
  it.each([
    ['north', { latitude: PANORAMA.latitude + STEP, longitude: 4.8515 }, 0],
    ['east', { latitude: PANORAMA.latitude, longitude: 4.8515 + STEP }, 90],
    ['south', { latitude: PANORAMA.latitude - STEP, longitude: 4.8515 }, 180],
    ['west', { latitude: PANORAMA.latitude, longitude: 4.8515 - STEP }, 270],
  ])('faces a point due %s', (_, to, heading) => {
    expect(headingToward({ from: PANORAMA, to })).toBe(heading);
  });

  it('faces a point to the south-west', () => {
    const heading = headingToward({
      from: PANORAMA,
      to: {
        latitude: PANORAMA.latitude - STEP,
        longitude:
          PANORAMA.longitude - STEP / Math.cos((45.7578 * Math.PI) / 180),
      },
    });
    expect(heading).toBe(225);
  });

  it('wraps a heading just west of north to 0, never 360', () => {
    const heading = headingToward({
      from: PANORAMA,
      to: { latitude: PANORAMA.latitude + STEP, longitude: 4.8515 - 0.000001 },
    });
    expect(heading).toBe(0);
  });
});
