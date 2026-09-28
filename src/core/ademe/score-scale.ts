export type ScoreBand =
  | 'veryLikely'
  | 'likely'
  | 'approximate'
  | 'uncertain'
  | 'unreliable';

type Rgb = readonly [number, number, number];

type RampStop = { score: number; rgb: Rgb };

// why: a data-encoding ramp, like the DPE label colours: the hue carries the
// score itself, so it is exempt from the single accent colour of DESIGN.md.
const RAMP: readonly [RampStop, ...RampStop[]] = [
  { score: 52, rgb: [196, 92, 79] },
  { score: 64, rgb: [221, 141, 74] },
  { score: 74, rgb: [214, 178, 66] },
  { score: 86, rgb: [90, 175, 96] },
  { score: 100, rgb: [24, 132, 86] },
];

const LOWEST_SCORE = 52;
const HIGHEST_SCORE = 100;
const TINT_TOWARD_WHITE = 0.86;

const BANDS: readonly { from: number; band: ScoreBand }[] = [
  { from: 90, band: 'veryLikely' },
  { from: 80, band: 'likely' },
  { from: 70, band: 'approximate' },
  { from: 60, band: 'uncertain' },
];

export function scoreFromConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.min(100, Math.max(0, Math.round(confidence * 100)));
}

function clampToRamp(score: number): number {
  if (!Number.isFinite(score)) return LOWEST_SCORE;
  return Math.min(HIGHEST_SCORE, Math.max(LOWEST_SCORE, score));
}

function rampRgb(score: number): Rgb {
  const clamped = clampToRamp(score);
  let lower = RAMP[0];
  for (const upper of RAMP) {
    if (clamped <= upper.score) {
      if (upper.score === lower.score) return upper.rgb;
      const ratio = (clamped - lower.score) / (upper.score - lower.score);
      return [
        lower.rgb[0] + (upper.rgb[0] - lower.rgb[0]) * ratio,
        lower.rgb[1] + (upper.rgb[1] - lower.rgb[1]) * ratio,
        lower.rgb[2] + (upper.rgb[2] - lower.rgb[2]) * ratio,
      ];
    }
    lower = upper;
  }
  return lower.rgb;
}

function css([red, green, blue]: Rgb): string {
  return `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
}

export function scoreColour(score: number): string {
  return css(rampRgb(score));
}

export function scoreTint(score: number): string {
  const rgb = rampRgb(score);
  return css([
    rgb[0] + (255 - rgb[0]) * TINT_TOWARD_WHITE,
    rgb[1] + (255 - rgb[1]) * TINT_TOWARD_WHITE,
    rgb[2] + (255 - rgb[2]) * TINT_TOWARD_WHITE,
  ]);
}

export function scoreBand(score: number): ScoreBand {
  return BANDS.find(({ from }) => score >= from)?.band ?? 'unreliable';
}
