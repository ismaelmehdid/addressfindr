import { describe, expect, it } from 'vitest';
import { EMPTY_EXTRACTED_VALUES } from '@/core/listing/types';
import { rankCandidates, scoreCandidate } from './score-candidates';
import type { DpeRecord } from './types';

function record(over: Partial<DpeRecord> & { dpeNumber: string }): DpeRecord {
  return {
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
    yearBuilt: 1989,
    floor: 0,
    buildingComplement: null,
    establishedOn: '2026-01-07',
    geocodingScore: 0.7,
    ...over,
  };
}

const LISTING = {
  ...EMPTY_EXTRACTED_VALUES,
  propertyType: 'apartment' as const,
  surfaceM2: 63,
  dpeClass: 'D' as const,
  gesClass: 'D' as const,
  dpeKwhM2Year: 200,
  gesKgCo2M2Year: 40,
  yearBuilt: 1989,
};

describe('scoreCandidate', () => {
  it('gives full confidence when every comparable signal agrees', () => {
    const scored = scoreCandidate({
      values: LISTING,
      record: record({ dpeNumber: 'A' }),
    });
    expect(scored.confidence).toBe(1);
    expect(scored.diverged).toEqual([]);
    expect(scored.matched).toContain('dpeKwhM2Year');
  });

  it('drops confidence when the numeric consumption diverges', () => {
    const scored = scoreCandidate({
      values: LISTING,
      record: record({ dpeNumber: 'A', dpeKwhM2Year: 320 }),
    });
    expect(scored.confidence).toBeLessThan(1);
    expect(scored.diverged).toContain('dpeKwhM2Year');
  });

  it('ignores a signal the listing does not carry', () => {
    const withoutYear = { ...LISTING, yearBuilt: null };
    const scored = scoreCandidate({
      values: withoutYear,
      record: record({ dpeNumber: 'A' }),
    });
    expect(scored.matched).not.toContain('yearBuilt');
    expect(scored.diverged).not.toContain('yearBuilt');
    expect(scored.confidence).toBe(1);
  });

  it('never compares a floor the ADEME row left at its default of zero', () => {
    const scored = scoreCandidate({
      values: { ...LISTING, floor: 2 },
      record: record({ dpeNumber: 'A', floor: 0 }),
    });
    expect(scored.matched).not.toContain('floor');
    expect(scored.diverged).not.toContain('floor');
  });

  it('compares a floor the ADEME row actually states', () => {
    const agree = scoreCandidate({
      values: { ...LISTING, floor: 2 },
      record: record({ dpeNumber: 'A', floor: 2 }),
    });
    expect(agree.matched).toContain('floor');

    const disagree = scoreCandidate({
      values: { ...LISTING, floor: 2 },
      record: record({ dpeNumber: 'A', floor: 5 }),
    });
    expect(disagree.diverged).toContain('floor');
  });

  it('is zero-confidence when nothing at all can be compared', () => {
    const scored = scoreCandidate({
      values: EMPTY_EXTRACTED_VALUES,
      record: record({ dpeNumber: 'A' }),
    });
    expect(scored.confidence).toBe(0);
    expect(scored.matched).toEqual([]);
  });

  it('clamps a heavily contradicted row to zero rather than a negative score', () => {
    const scored = scoreCandidate({
      values: LISTING,
      record: record({
        dpeNumber: 'A',
        dpeClass: 'A',
        gesClass: 'A',
        dpeKwhM2Year: 40,
        gesKgCo2M2Year: 2,
        yearBuilt: 1850,
      }),
    });
    expect(scored.confidence).toBe(0);
  });
});

describe('rankCandidates', () => {
  it('orders by confidence and keeps the divergence visible', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        record({ dpeNumber: 'weak', dpeKwhM2Year: 330, gesKgCo2M2Year: 90 }),
        record({ dpeNumber: 'strong' }),
      ],
      truncated: false,
    });

    expect(ranked.candidates.map((c) => c.record.dpeNumber)).toEqual([
      'strong',
      'weak',
    ]);
    expect(ranked.inspected).toBe(2);
    expect(ranked.truncated).toBe(false);
  });

  it('breaks a confidence tie on the geocoding score, then deterministically', () => {
    const ranked = rankCandidates({
      values: LISTING,
      records: [
        record({ dpeNumber: 'b', geocodingScore: 0.5 }),
        record({ dpeNumber: 'a', geocodingScore: 0.9 }),
      ],
      truncated: false,
    });
    expect(ranked.candidates[0]?.record.dpeNumber).toBe('a');
  });

  it('caps the shortlist and reports truncation', () => {
    const records = Array.from({ length: 25 }, (_, i) =>
      record({ dpeNumber: `dpe-${i}` }),
    );
    const ranked = rankCandidates({
      values: LISTING,
      records,
      truncated: true,
    });
    expect(ranked.candidates).toHaveLength(10);
    expect(ranked.inspected).toBe(25);
    expect(ranked.truncated).toBe(true);
  });
});
