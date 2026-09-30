import { describe, expect, it } from 'vitest';
import { FEEDBACK_REASONS, FEEDBACK_VERDICTS, isSameAnswer } from './feedback';

describe('feedback vocabulary', () => {
  it('lists the two verdicts a feedback can carry', () => {
    expect(FEEDBACK_VERDICTS).toEqual(['confirmed', 'none_match']);
  });

  it('lists the four reasons a none-match detail can give', () => {
    expect(FEEDBACK_REASONS).toEqual([
      'wrong_commune',
      'wrong_dwellings',
      'address_missing',
      'unsure',
    ]);
  });
});

describe('isSameAnswer', () => {
  it('treats a repeated confirmation of the same dwelling as a replay', () => {
    expect(
      isSameAnswer(
        { verdict: 'confirmed', confirmedDpeNumber: '2269E0123456A' },
        { verdict: 'confirmed', confirmedDpeNumber: '2269E0123456A' },
      ),
    ).toBe(true);
  });

  it('treats a repeated none-match as a replay', () => {
    expect(
      isSameAnswer(
        { verdict: 'none_match', confirmedDpeNumber: null },
        { verdict: 'none_match', confirmedDpeNumber: null },
      ),
    ).toBe(true);
  });

  it('treats a confirmation of another dwelling as a different answer', () => {
    expect(
      isSameAnswer(
        { verdict: 'confirmed', confirmedDpeNumber: '2269E0123456A' },
        { verdict: 'confirmed', confirmedDpeNumber: '2269E0999999B' },
      ),
    ).toBe(false);
  });

  it('treats none-match after a confirmation as a different answer', () => {
    expect(
      isSameAnswer(
        { verdict: 'confirmed', confirmedDpeNumber: '2269E0123456A' },
        { verdict: 'none_match', confirmedDpeNumber: null },
      ),
    ).toBe(false);
  });
});
