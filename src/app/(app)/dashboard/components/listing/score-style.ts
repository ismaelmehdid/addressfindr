import type { CSSProperties } from 'react';
import {
  type ScoreBand,
  scoreColour,
  scoreInk,
  scoreTint,
} from '@/core/ademe/score-scale';

export type ScoreStyle = CSSProperties & {
  '--score': string;
  '--score-tint': string;
  '--score-ink': string;
};

// why: the ramp colour is computed per result, so it reaches Tailwind as CSS
// variables (bg-(--score), ring-(--score)) rather than as class names.
export function scoreStyle(score: number): ScoreStyle {
  return {
    '--score': scoreColour(score),
    '--score-tint': scoreTint(score),
    '--score-ink': scoreInk(score) === 'white' ? '#ffffff' : '#2d2f2a',
  };
}

export const SCORE_LABEL_KEY = {
  veryLikely: 'scoreVeryLikely',
  likely: 'scoreLikely',
  approximate: 'scoreApproximate',
  uncertain: 'scoreUncertain',
  unreliable: 'scoreUnreliable',
} as const satisfies Record<ScoreBand, string>;
