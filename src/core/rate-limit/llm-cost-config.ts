export type ModelPricing = {
  readonly inputPerMillion: number;
  readonly outputPerMillion: number;
};

const PRICING_USD: Record<string, ModelPricing> = {
  'gpt-5.5': { inputPerMillion: 5, outputPerMillion: 30 },
  'gpt-5.4': { inputPerMillion: 2.5, outputPerMillion: 15 },
  'gpt-5.4-mini': { inputPerMillion: 0.75, outputPerMillion: 4.5 },
  'gpt-5.4-nano': { inputPerMillion: 0.2, outputPerMillion: 1.25 },
};

const FALLBACK_PRICING: ModelPricing = PRICING_USD['gpt-5.4'] ?? {
  inputPerMillion: 2.5,
  outputPerMillion: 15,
};

export function usdCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = PRICING_USD[model] ?? FALLBACK_PRICING;
  return (
    (inputTokens * rates.inputPerMillion +
      outputTokens * rates.outputPerMillion) /
    1_000_000
  );
}

export function microCents(usd: number): number {
  return Math.round(usd * 1_000_000);
}

export function usdFromMicroCents(value: number): number {
  return value / 1_000_000;
}
