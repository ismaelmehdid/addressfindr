import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_REASONS,
  FEEDBACK_VERDICTS,
  isFeedbackReason,
  isSameAnswer,
  MAX_FEEDBACK_CANDIDATES,
  toFeedbackCandidates,
} from './feedback';

describe('feedback vocabulary', () => {
  it('lists the two verdicts the results view can send', () => {
    expect(FEEDBACK_VERDICTS).toEqual(['confirmed', 'none_match']);
  });

  it('lists the four reasons of the none-match form', () => {
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

describe('isFeedbackReason', () => {
  it('accepts every listed reason', () => {
    for (const reason of FEEDBACK_REASONS) {
      expect(isFeedbackReason(reason)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isFeedbackReason('other')).toBe(false);
    expect(isFeedbackReason(null)).toBe(false);
    expect(isFeedbackReason(undefined)).toBe(false);
    expect(isFeedbackReason(1)).toBe(false);
  });
});

describe('toFeedbackCandidates', () => {
  it('keeps each shown dwelling and its score, in the shown order', () => {
    expect(
      toFeedbackCandidates([
        { record: { dpeNumber: '2269E0123456A' }, confidence: 0.93 },
        { record: { dpeNumber: '2269E0999999B' }, confidence: 0.71 },
      ]),
    ).toEqual([
      { dpeNumber: '2269E0123456A', score: 0.93 },
      { dpeNumber: '2269E0999999B', score: 0.71 },
    ]);
  });

  it('keeps at most the ten candidates a result can show', () => {
    const shown = Array.from({ length: 12 }, (_, i) => ({
      record: { dpeNumber: `2269E00000${String(i).padStart(2, '0')}A` },
      confidence: 0.5,
    }));

    const candidates = toFeedbackCandidates(shown);

    expect(candidates).toHaveLength(MAX_FEEDBACK_CANDIDATES);
    expect(candidates[9]?.dpeNumber).toBe('2269E0000009A');
  });
});
