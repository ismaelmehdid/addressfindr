import { describe, expect, it } from 'vitest';
import {
  scoreBand,
  scoreColour,
  scoreFromConfidence,
  scoreInk,
  scoreTint,
} from './score-scale';

describe('scoreFromConfidence', () => {
  it('reads a confidence as a whole score out of 100', () => {
    expect(scoreFromConfidence(0.724)).toBe(72);
    expect(scoreFromConfidence(1)).toBe(100);
    expect(scoreFromConfidence(0)).toBe(0);
  });

  it('keeps the score between 0 and 100', () => {
    expect(scoreFromConfidence(1.2)).toBe(100);
    expect(scoreFromConfidence(-0.1)).toBe(0);
    expect(scoreFromConfidence(Number.NaN)).toBe(0);
  });
});

describe('scoreColour', () => {
  it('lands exactly on every stop of the ramp', () => {
    expect(scoreColour(100)).toBe('rgb(24, 132, 86)');
    expect(scoreColour(86)).toBe('rgb(90, 175, 96)');
    expect(scoreColour(74)).toBe('rgb(214, 178, 66)');
    expect(scoreColour(64)).toBe('rgb(221, 141, 74)');
    expect(scoreColour(52)).toBe('rgb(196, 92, 79)');
  });

  it('interpolates linearly between two stops', () => {
    expect(scoreColour(93)).toBe('rgb(57, 154, 91)');
    expect(scoreColour(69)).toBe('rgb(218, 160, 70)');
  });

  it('clamps below 52 and above 100', () => {
    expect(scoreColour(30)).toBe(scoreColour(52));
    expect(scoreColour(0)).toBe(scoreColour(52));
    expect(scoreColour(120)).toBe(scoreColour(100));
  });

  it('treats a score that is not a number as the lowest one', () => {
    expect(scoreColour(Number.NaN)).toBe(scoreColour(52));
  });
});

describe('scoreTint', () => {
  it('mixes the colour 86 % toward white', () => {
    expect(scoreTint(100)).toBe('rgb(223, 238, 231)');
    expect(scoreTint(52)).toBe('rgb(247, 232, 230)');
  });

  it('follows the clamped colour', () => {
    expect(scoreTint(10)).toBe(scoreTint(52));
  });
});

describe('scoreBand', () => {
  it('names each band from its lower bound', () => {
    expect(scoreBand(100)).toBe('veryLikely');
    expect(scoreBand(90)).toBe('veryLikely');
    expect(scoreBand(89)).toBe('likely');
    expect(scoreBand(80)).toBe('likely');
    expect(scoreBand(79)).toBe('approximate');
    expect(scoreBand(70)).toBe('approximate');
    expect(scoreBand(69)).toBe('uncertain');
    expect(scoreBand(60)).toBe('uncertain');
    expect(scoreBand(59)).toBe('unreliable');
    expect(scoreBand(0)).toBe('unreliable');
  });

  it('never calls a score that is not a number reliable', () => {
    expect(scoreBand(Number.NaN)).toBe('unreliable');
  });
});

describe('scoreInk', () => {
  it('writes white on the dark green of a top score', () => {
    expect(scoreInk(100)).toBe('white');
  });

  // why: white on the yellow stop (score 74) is about 2:1, below WCAG AA.
  it('writes ink on the light yellow of a middling score', () => {
    expect(scoreInk(74)).toBe('ink');
  });

  it('decides on the clamped colour for out-of-range scores', () => {
    expect(scoreInk(140)).toBe(scoreInk(100));
    expect(scoreInk(10)).toBe(scoreInk(52));
  });
});
