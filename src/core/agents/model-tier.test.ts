import { describe, expect, it } from 'vitest';
import {
  MODEL_TIER,
  type ModelTierMap,
  openaiModelString,
  pickModel,
} from './model-tier';

const MAP: ModelTierMap = {
  main: 'gpt-5.4-mini' as never,
  cheap: 'gpt-5.4-nano' as never,
};

describe('MODEL_TIER', () => {
  it('exposes the two known tiers', () => {
    expect(MODEL_TIER).toEqual({
      MAIN: 'main',
      CHEAP: 'cheap',
    });
  });
});

describe('pickModel', () => {
  it('returns the model for each tier', () => {
    expect(pickModel(MAP, 'main')).toBe('gpt-5.4-mini');
    expect(pickModel(MAP, 'cheap')).toBe('gpt-5.4-nano');
  });
});

describe('openaiModelString', () => {
  it('prefixes any model id with the openai/ provider', () => {
    expect(openaiModelString('gpt-5.4-mini')).toBe('openai/gpt-5.4-mini');
    expect(openaiModelString('gpt-5.4')).toBe('openai/gpt-5.4');
  });
});
