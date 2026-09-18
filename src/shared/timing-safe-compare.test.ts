import { describe, expect, it } from 'vitest';
import { timingSafeCompareStrings } from './timing-safe-compare';

describe('timingSafeCompareStrings — cron auth gate', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeCompareStrings('abc', 'abc')).toBe(true);
  });
  it('returns false for different-length strings without throwing', () => {
    expect(timingSafeCompareStrings('abc', 'abcd')).toBe(false);
    expect(timingSafeCompareStrings('', 'x')).toBe(false);
  });
  it('returns false for same-length different content', () => {
    expect(timingSafeCompareStrings('abc', 'abd')).toBe(false);
  });
  it('handles empty strings', () => {
    expect(timingSafeCompareStrings('', '')).toBe(true);
  });
  it('handles UTF-8 multibyte', () => {
    expect(timingSafeCompareStrings('виноделен', 'виноделен')).toBe(true);
    expect(timingSafeCompareStrings('виноделен', 'виноделец')).toBe(false);
  });
});
