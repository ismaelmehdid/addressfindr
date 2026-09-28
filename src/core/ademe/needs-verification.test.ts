import { describe, expect, it } from 'vitest';
import { needsVerification } from './needs-verification';
import type { AddressCandidate, DpeRecord, MatchSignal } from './types';

function record(dpeNumber: string): DpeRecord {
  return {
    dpeNumber,
    dataset: 'existing',
    banId: null,
    address: '16 Rue Lavoisier 69003 Lyon',
    streetNumber: '16',
    street: 'Rue Lavoisier',
    postalCode: '69003',
    city: 'Lyon',
    inseeCode: '69383',
    propertyType: 'apartment',
    surfaceM2: 63,
    dpeClass: 'D',
    gesClass: 'D',
    dpeKwhM2Year: 200,
    gesKgCo2M2Year: 40,
    heatingEnergy: null,
    yearBuilt: null,
    landSurfaceM2: null,
    buildingFloors: null,
    floor: null,
    buildingComplement: null,
    establishedOn: null,
    visitedOn: null,
    annualEnergyCostEur: null,
    geocodingScore: 0.9,
    point: null,
  };
}

function candidate(
  dpeNumber: string,
  confidence: number,
  diverged: readonly MatchSignal[] = [],
): AddressCandidate {
  return {
    record: record(dpeNumber),
    confidence,
    matched: ['surfaceM2'],
    diverged,
    supportingRecords: 1,
  };
}

describe('needsVerification', () => {
  it('is quiet for a clear first answer that agrees on everything', () => {
    expect(
      needsVerification({
        candidates: [candidate('a', 0.91), candidate('b', 0.66)],
        truncated: false,
      }),
    ).toBe(false);
  });

  it('asks for a check when the first answer differs on a signal', () => {
    expect(
      needsVerification({
        candidates: [
          candidate('a', 0.91, ['heatingEnergy']),
          candidate('b', 0.4),
        ],
        truncated: false,
      }),
    ).toBe(true);
  });

  // why: scores are shown rounded to /100, so the gap is measured on what the
  // user sees: 84 against 81 is a close call even if the raw gap is 0.034.
  it('asks for a check when the runner-up is within 10 points', () => {
    expect(
      needsVerification({
        candidates: [candidate('a', 0.84), candidate('b', 0.806)],
        truncated: false,
      }),
    ).toBe(true);
  });

  it('is quiet when the runner-up is exactly 10 points behind', () => {
    expect(
      needsVerification({
        candidates: [candidate('a', 0.9), candidate('b', 0.8)],
        truncated: false,
      }),
    ).toBe(false);
  });

  it('judges a single candidate on its own divergence only', () => {
    expect(
      needsVerification({
        candidates: [candidate('a', 0.5)],
        truncated: false,
      }),
    ).toBe(false);
    expect(
      needsVerification({
        candidates: [candidate('a', 0.9, ['floor'])],
        truncated: false,
      }),
    ).toBe(true);
  });

  it('is quiet without candidates', () => {
    expect(needsVerification({ candidates: [], truncated: false })).toBe(false);
  });

  // why: the row that would have answered may sit past the row-limit cutoff,
  // so even a clear, agreeing top result deserves a caution.
  it('asks for a check when the pool was truncated, even with a clear answer', () => {
    expect(
      needsVerification({
        candidates: [candidate('a', 0.95), candidate('b', 0.2)],
        truncated: true,
      }),
    ).toBe(true);
  });

  it('is quiet when truncated but there are no candidates to show', () => {
    expect(needsVerification({ candidates: [], truncated: true })).toBe(false);
  });
});
