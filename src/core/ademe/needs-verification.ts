import type { AddressMatch } from './types';

// why: scores are shown rounded to /100, so the gap is measured on what the
// user sees.
const CLOSE_RUNNER_UP_POINTS = 10;

function points(confidence: number): number {
  return Math.round(confidence * 100);
}

export function needsVerification(
  match: Pick<AddressMatch, 'candidates'>,
): boolean {
  const [top, runnerUp] = match.candidates;
  if (top === undefined) return false;
  if (top.diverged.length > 0) return true;
  if (runnerUp === undefined) return false;
  return (
    points(top.confidence) - points(runnerUp.confidence) <
    CLOSE_RUNNER_UP_POINTS
  );
}
