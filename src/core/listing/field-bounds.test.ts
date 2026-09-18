import { describe, expect, it } from 'vitest';
import { withinBounds } from './field-bounds';

describe('withinBounds', () => {
  it('accepts a plausible surface', () => {
    expect(withinBounds('surfaceM2', 68.5)).toBe(true);
  });

  it('rejects a surface below the floor', () => {
    expect(withinBounds('surfaceM2', 4)).toBe(false);
  });

  it('rejects a surface above the ceiling', () => {
    expect(withinBounds('surfaceM2', 2001)).toBe(false);
  });

  it('accepts a basement floor', () => {
    expect(withinBounds('floor', -2)).toBe(true);
  });

  it('rejects a year too far in the future', () => {
    expect(withinBounds('yearBuilt', new Date().getFullYear() + 3)).toBe(false);
  });

  it('accepts next year as a build year', () => {
    expect(withinBounds('yearBuilt', new Date().getFullYear() + 1)).toBe(true);
  });

  it('rejects a non-finite number', () => {
    expect(withinBounds('rooms', Number.NaN)).toBe(false);
  });

  it('returns true for a field with no numeric bounds', () => {
    expect(withinBounds('city', 1)).toBe(true);
  });
});
