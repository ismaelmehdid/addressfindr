import type { AddressMatch } from './types';

// why: scores are shown rounded to /100, so the gap is measured on what the
// user sees.
const CLOSE_RUNNER_UP_POINTS = 10;

function points(confidence: number): number {
  return Math.round(confidence * 100);
}

export function needsVerification(
  match: Pick<AddressMatch, 'candidates' | 'truncated'>,
): boolean {
  const [top, runnerUp] = match.candidates;
  if (top === undefined) return false;
  // why: the row that would have answered may sit past the row-limit cutoff,
  // so a truncated pool deserves a caution even when the shown top result is
  // clear and agreeing.
  if (match.truncated) return true;
  if (top.diverged.length > 0) return true;
  if (runnerUp === undefined) return false;
  return (
    points(top.confidence) - points(runnerUp.confidence) <
    CLOSE_RUNNER_UP_POINTS
  );
}
