import { describe, expect, it } from 'vitest';
import {
  mergeExtractions,
  missingRequiredFields,
  unfilledFields,
} from './merge-extractions';

describe('mergeExtractions', () => {
  it('prefers hydration over json-ld for the same field', () => {
    const merged = mergeExtractions([
      { source: 'hydration', values: { surfaceM2: 102 } },
      { source: 'json-ld', values: { surfaceM2: 80 } },
    ]);
    expect(merged.values.surfaceM2).toBe(102);
    expect(merged.sources.surfaceM2).toBe('hydration');
  });

  it('prefers json-ld over llm for the same field', () => {
    const merged = mergeExtractions([
      { source: 'json-ld', values: { city: 'Paris 11e' } },
      { source: 'llm', values: { city: 'Nation' } },
    ]);
    expect(merged.values.city).toBe('Paris 11e');
    expect(merged.sources.city).toBe('json-ld');
  });

  it('falls back to llm when earlier layers are silent', () => {
    const merged = mergeExtractions([
      { source: 'hydration', values: {} },
      { source: 'llm', values: { dpeClass: 'C' } },
    ]);
    expect(merged.values.dpeClass).toBe('C');
    expect(merged.sources.dpeClass).toBe('llm');
  });

  it('marks an untouched field absent', () => {
    const merged = mergeExtractions([]);
    expect(merged.values.surfaceM2).toBeNull();
    expect(merged.sources.surfaceM2).toBe('absent');
  });

  it('treats an explicit null as no value', () => {
    const merged = mergeExtractions([
      { source: 'hydration', values: { rooms: null } },
      { source: 'llm', values: { rooms: 3 } },
    ]);
    expect(merged.values.rooms).toBe(3);
    expect(merged.sources.rooms).toBe('llm');
  });

  it('fills sources for every known field', () => {
    const merged = mergeExtractions([]);
    expect(Object.keys(merged.sources)).toHaveLength(17);
  });
});

describe('missingRequiredFields', () => {
  it('lists the required fields that are still null', () => {
    const merged = mergeExtractions([
      { source: 'hydration', values: { surfaceM2: 80, rooms: 4 } },
    ]);
    expect(missingRequiredFields(merged.values)).toEqual([
      'dpeClass',
      'city',
      'propertyType',
    ]);
  });

  it('returns an empty list when everything required is present', () => {
    const merged = mergeExtractions([
      {
        source: 'hydration',
        values: {
          surfaceM2: 80,
          rooms: 4,
          dpeClass: 'C',
          city: 'Lyon',
          propertyType: 'apartment',
        },
      },
    ]);
    expect(missingRequiredFields(merged.values)).toEqual([]);
  });
});

describe('unfilledFields', () => {
  it('lists every null field, not only the required ones', () => {
    const merged = mergeExtractions([
      {
        source: 'hydration',
        values: {
          surfaceM2: 80,
          rooms: 4,
          dpeClass: 'C',
          city: 'Lyon',
          propertyType: 'apartment',
        },
      },
    ]);
    expect(missingRequiredFields(merged.values)).toEqual([]);
    expect(unfilledFields(merged.values)).toContain('gesClass');
    expect(unfilledFields(merged.values)).toContain('priceEur');
    expect(unfilledFields(merged.values)).toContain('transactionType');
    expect(unfilledFields(merged.values)).toContain('inseeCode');
  });

  it('returns an empty list once every field has a value', () => {
    const merged = mergeExtractions([]);
    for (const field of unfilledFields(merged.values)) {
      expect(merged.values[field]).toBeNull();
    }
    expect(unfilledFields(merged.values).length).toBe(
      Object.keys(merged.sources).length,
    );
  });
});
