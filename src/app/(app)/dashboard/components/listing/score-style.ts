import type { CSSProperties } from 'react';
import {
  type ScoreBand,
  scoreColour,
  scoreTint,
} from '@/core/ademe/score-scale';

export type ScoreStyle = CSSProperties & {
  '--score': string;
  '--score-tint': string;
};

// why: the ramp colour is computed per result, so it reaches Tailwind as CSS
// variables (bg-(--score), ring-(--score)) rather than as class names.
export function scoreStyle(score: number): ScoreStyle {
  return { '--score': scoreColour(score), '--score-tint': scoreTint(score) };
}

export const SCORE_LABEL_KEY = {
  veryLikely: 'scoreVeryLikely',
  likely: 'scoreLikely',
  approximate: 'scoreApproximate',
  uncertain: 'scoreUncertain',
  unreliable: 'scoreUnreliable',
} as const satisfies Record<ScoreBand, string>;
