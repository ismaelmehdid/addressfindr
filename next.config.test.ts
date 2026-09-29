import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

// why: the image optimizer re-fetches a local URL with no browser headers, so
// /_next/image?url=/api/street-view… passed the same-origin check and billed
// Google on behalf of any page that embedded it.
describe('next.config', () => {
  it('turns the image optimizer off', () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });
});
