import { describe, expect, it } from 'vitest';
import { microCents, usdCost, usdFromMicroCents } from './llm-cost-config';

describe('usdCost', () => {
  it('computes cost for a known model (gpt-5.4-nano)', () => {
    // 1M input + 1M output = $0.20 + $1.25 = $1.45
    expect(usdCost('gpt-5.4-nano', 1_000_000, 1_000_000)).toBeCloseTo(1.45, 6);
  });

  it('computes cost for gpt-5.4', () => {
    // 1M input * $2.50 = $2.50
    expect(usdCost('gpt-5.4', 1_000_000, 0)).toBeCloseTo(2.5, 6);
    expect(usdCost('gpt-5.4', 0, 1_000_000)).toBeCloseTo(15, 6);
  });

  it('falls back to gpt-5.4 pricing for unknown models', () => {
    expect(usdCost('mystery-model', 1_000_000, 1_000_000)).toBe(
      usdCost('gpt-5.4', 1_000_000, 1_000_000),
    );
  });

  it('returns 0 when no tokens consumed', () => {
    expect(usdCost('gpt-5.4-nano', 0, 0)).toBe(0);
  });

  it('scales linearly with token count', () => {
    const small = usdCost('gpt-5.4-nano', 1000, 1000);
    const big = usdCost('gpt-5.4-nano', 10_000, 10_000);
    expect(big).toBeCloseTo(small * 10, 6);
  });
});

describe('microCents <-> usd', () => {
  it('microCents rounds USD to nearest integer micro-cent', () => {
    expect(microCents(1)).toBe(1_000_000);
    expect(microCents(0.0001234)).toBe(123);
  });

  it('usdFromMicroCents inverts microCents', () => {
    expect(usdFromMicroCents(1_000_000)).toBe(1);
    expect(usdFromMicroCents(0)).toBe(0);
    expect(usdFromMicroCents(500_000)).toBe(0.5);
  });
});
