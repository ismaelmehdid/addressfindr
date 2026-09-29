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

  it('rejects a street address the model invented', () => {
    const values = resolveQuotedFields({
      source: SOURCE,
      quotes: { streetAddress: 'Rue Guénot' },
    });
    expect(values.streetAddress).toBeUndefined();
  });

  // Ce fichier ne peut PAS distinguer une rue d'une station de metro : les deux
  // sont des chaines presentes dans la page. La protection contre "Rue des
  // Boulets" est la precedence — la couche structuree fournit la vraie rue avant
  // que le LLM ne soit consulte (voir merge-extractions et extract-listing).
  // Ce test fige ce que la couche garantit reellement, pour qu'on ne se croie
  // pas protege ici.
  it('accepts a present-but-wrong street quote — precedence is what protects, not this gate', () => {
    const values = resolveQuotedFields({
      source: SOURCE,
      quotes: { streetAddress: 'Rue des Boulets' },
    });
    expect(values.streetAddress).toBe('Rue des Boulets');
  });

  it('reads a DPE letter from a real quote', () => {
    const values = resolveQuotedFields({
      source: SOURCE,
      quotes: { dpeClass: 'Diagnostic de performance énergétique (DPE)\nC' },
    });
    expect(values.dpeClass).toBe('C');
  });

  // why: regression pour la confusion DPE/GES — un quote GES seul ne doit
  // jamais satisfaire dpeClass, meme s'il parse et respecte les bornes.
  it('refuses a GES-only quote for dpeClass', () => {
    const source = 'Emissions GES B pour ce bien';
    const values = resolveQuotedFields({
      source,
      quotes: { dpeClass: 'Emissions GES B' },
    });
    expect(values.dpeClass).toBeUndefined();
  });

  it('refuses a DPE-only quote for gesClass', () => {
    const source = 'DPE B pour ce bien';
    const values = resolveQuotedFields({
      source,
      quotes: { gesClass: 'DPE B' },
    });
    expect(values.gesClass).toBeUndefined();
  });

  it('reads the floor and the building floor count from one quote', () => {
    const quote = 'au 3e étage sur 5';
    const values = resolveQuotedFields({
      source: `Appartement ${quote} avec ascenseur`,
      quotes: { floor: quote, buildingFloors: quote },
    });
    expect(values.floor).toBe(3);
    expect(values.buildingFloors).toBe(5);
  });

  it('reads the floor, not the room count, from a quote carrying both', () => {
    const quote = '3 pièces au 2e étage';
    const values = resolveQuotedFields({
      source: `Appartement ${quote}`,
      quotes: { floor: quote, buildingFloors: quote },
    });
    expect(values.floor).toBe(2);
    expect(values.buildingFloors).toBeUndefined();
  });

  it('ignores a field with no quote', () => {
    expect(resolveQuotedFields({ source: SOURCE, quotes: {} })).toEqual({});
  });

  // why: ces espaces sont invisibles et un echappement \uXXXX ecrit dans un
  // litteral a deja ete aplati en espace ordinaire trois fois dans ce plan. On
  // les construit par code point, et on verifie leur presence AVANT de s'en
  // servir — sinon le test passerait en ne testant rien.
  it('matches across a unicode space divergence on either side', () => {
    const nbsp = String.fromCharCode(0x00a0);
    const narrowNbsp = String.fromCharCode(0x202f);

    const sourceWithNbsp = `Surface habitable : 80,5${nbsp}m²`;
    expect(sourceWithNbsp).toContain(nbsp);
    expect(
      resolveQuotedFields({
        source: sourceWithNbsp,
        quotes: { surfaceM2: 'Surface habitable : 80,5 m²' },
      }).surfaceM2,
    ).toBe(80.5);

    const quoteWithNarrowNbsp = `Surface habitable : 80,5${narrowNbsp}m²`;
    expect(quoteWithNarrowNbsp).toContain(narrowNbsp);
    expect(
      resolveQuotedFields({
        source: 'Surface habitable : 80,5 m²',
        quotes: { surfaceM2: quoteWithNarrowNbsp },
      }).surfaceM2,
    ).toBe(80.5);
  });

  it('never lets the model supply listingId or publishedAt', () => {
    const source = 'Annonce n°123456 publiée le 2024-01-15. Appartement 80 m²';
    const values = resolveQuotedFields({
      source,
      quotes: {
        listingId: 'Annonce n°123456',
        publishedAt: 'publiée le 2024-01-15',
        surfaceM2: 'Appartement 80 m²',
      },
    });
    expect(values.listingId).toBeUndefined();
    expect(values.publishedAt).toBeUndefined();
    expect(values.surfaceM2).toBe(80);
  });

  it('reads the DPE date and both energy cost bounds', () => {
    const source =
      "Date de réalisation du diagnostic énergétique : 14/04/2022\nMontant estimé des dépenses annuelles d'énergie : entre 1 290 € et 1 790 € par an.";
    const costQuote = 'entre 1 290 € et 1 790 € par an';
    const values = resolveQuotedFields({
      source,
      quotes: {
        dpeDate: 'Date de réalisation du diagnostic énergétique : 14/04/2022',
        annualEnergyCostMinEur: costQuote,
        annualEnergyCostMaxEur: costQuote,
      },
    });
    expect(values.dpeDate).toBe('2022-04-14');
    expect(values.annualEnergyCostMinEur).toBe(1290);
    expect(values.annualEnergyCostMaxEur).toBe(1790);
  });
});
