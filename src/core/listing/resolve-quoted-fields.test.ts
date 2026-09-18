import { describe, expect, it } from 'vitest';
import {
  quoteExistsInSource,
  resolveQuotedFields,
} from './resolve-quoted-fields';

const SOURCE = `## Performance énergétique
### Diagnostic de performance énergétique (DPE)
C
Appartement 4 pièces 80,5 m² – 3 chambres
Hardricourt (78250)
- Rue des Boulets
- Avron`;

describe('quoteExistsInSource', () => {
  it('matches despite differing whitespace', () => {
    expect(quoteExistsInSource(SOURCE, 'Appartement   4 pièces')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(quoteExistsInSource(SOURCE, 'HARDRICOURT (78250)')).toBe(true);
  });

  it('rejects a quote absent from the source', () => {
    expect(quoteExistsInSource(SOURCE, 'Surface Carrez : 65 m²')).toBe(false);
  });

  it('rejects an empty quote', () => {
    expect(quoteExistsInSource(SOURCE, '   ')).toBe(false);
  });
});

describe('resolveQuotedFields', () => {
  it('accepts a quote that is present and parseable', () => {
    const values = resolveQuotedFields({
      source: SOURCE,
      quotes: { surfaceM2: 'Appartement 4 pièces 80,5 m²' },
    });
    expect(values.surfaceM2).toBe(80.5);
  });

  it('rejects a fabricated quote', () => {
    const values = resolveQuotedFields({
      source: SOURCE,
      quotes: { surfaceM2: 'Surface habitable : 120 m²' },
    });
    expect(values.surfaceM2).toBeUndefined();
  });

  it('rejects a quote that is present but unparseable for the field', () => {
    const values = resolveQuotedFields({
      source: SOURCE,
      quotes: { dpeClass: '- Avron' },
    });
    expect(values.dpeClass).toBeUndefined();
  });

  it('rejects a value outside its bounds', () => {
    const values = resolveQuotedFields({
      source: 'Le terrain fait 3000 m² mais la surface est 3000 m²',
      quotes: { surfaceM2: 'la surface est 3000 m²' },
    });
    expect(values.surfaceM2).toBeUndefined();
  });

  it('does not let a metro station become a street address', () => {
    const values = resolveQuotedFields({
      source: SOURCE,
      quotes: { streetAddress: 'Rue Guénot' },
    });
    expect(values.streetAddress).toBeUndefined();
  });

  it('reads a DPE letter from a real quote', () => {
    const values = resolveQuotedFields({
      source: SOURCE,
      quotes: { dpeClass: 'Diagnostic de performance énergétique (DPE)\nC' },
    });
    expect(values.dpeClass).toBe('C');
  });

  it('ignores a field with no quote', () => {
    expect(resolveQuotedFields({ source: SOURCE, quotes: {} })).toEqual({});
  });
});
