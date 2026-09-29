import { describe, expect, it } from 'vitest';
import { parseLandSurfaceM2 } from './parse-values';

describe('parseLandSurfaceM2', () => {
  it('reads a plot area', () => {
    expect(parseLandSurfaceM2('Terrain de 450 m²')).toBe(450);
    expect(parseLandSurfaceM2('terrain 1 200 m2')).toBe(1200);
  });

  it('accepts the common synonyms for a plot', () => {
    expect(parseLandSurfaceM2('parcelle de 800 m²')).toBe(800);
    expect(parseLandSurfaceM2('sur un terrain arboré de 620 m²')).toBe(620);
  });

  it('accepts ares and hectares', () => {
    expect(parseLandSurfaceM2('terrain de 12 ares')).toBe(1200);
    expect(parseLandSurfaceM2('terrain de 1,5 hectare')).toBe(15000);
  });

  // why: la surface habitable et la surface de terrain se ressemblent dans une
  // annonce. Confondre les deux ferait comparer un salon a une parcelle.
  it('refuses a habitable surface', () => {
    expect(parseLandSurfaceM2('Surface habitable 120 m²')).toBeNull();
    expect(parseLandSurfaceM2('120 m² Carrez')).toBeNull();
  });

  it('refuses a garden, terrace or balcony, which are not the plot', () => {
    expect(parseLandSurfaceM2('jardin de 40 m²')).toBeNull();
    expect(parseLandSurfaceM2('terrasse de 20 m²')).toBeNull();
  });

  it('refuses a quote with no area at all', () => {
    expect(parseLandSurfaceM2('terrain constructible')).toBeNull();
  });

  // why: a house listing states the house and the plot in one sentence, the
  // house first. Land area weighs 3 in scoring, so the first area would
  // penalise the true house.
  it('takes the area attached to the plot, not the first one', () => {
    expect(
      parseLandSurfaceM2(
        'Maison de 5 pièces de 120 m² sur un terrain de 800 m²',
      ),
    ).toBe(800);
    expect(parseLandSurfaceM2('Maison de 120 m² sur 800 m² de terrain')).toBe(
      800,
    );
    expect(parseLandSurfaceM2('Maison 120 m², terrain 12 ares')).toBe(1200);
  });

  it('refuses a quote whose only area belongs to something else', () => {
    expect(parseLandSurfaceM2('Maison de 120 m² avec terrain')).toBeNull();
    expect(parseLandSurfaceM2('Terrain avec une maison de 120 m²')).toBeNull();
  });

  it('refuses a quote attaching two different areas to the plot', () => {
    expect(
      parseLandSurfaceM2('terrain de 800 m², parcelle de 650 m²'),
    ).toBeNull();
  });

  it('reads a plot described by comma-separated words', () => {
    expect(
      parseLandSurfaceM2('Sur un terrain plat, clos et arboré de 1000 m²'),
    ).toBe(1000);
  });

  // why: after a comma the next area usually describes the house, not the
  // plot — the bug 3 failure again, through punctuation.
  it('refuses an area after a comma unless the lead-in hands it to the plot', () => {
    expect(parseLandSurfaceM2('Terrain arboré, 120 m² au sol')).toBeNull();
    expect(parseLandSurfaceM2('Terrain clos, 120 m² de plain-pied')).toBeNull();
    expect(
      parseLandSurfaceM2('Terrain arboré, 110 m² sur deux niveaux'),
    ).toBeNull();
    expect(
      parseLandSurfaceM2('Terrain constructible, emprise au sol 90 m²'),
    ).toBeNull();
    expect(
      parseLandSurfaceM2('sur terrain arboré, beaux volumes : 140 m²'),
    ).toBeNull();
  });

  it('accepts a comma when an elided "d\'" hands the area to the plot', () => {
    const apostrophe = String.fromCharCode(0x2019);
    const typographic = `Terrain plat, arboré d${apostrophe}1 hectare`;
    expect(typographic).toContain(apostrophe);
    expect(parseLandSurfaceM2(typographic)).toBe(10000);
    expect(parseLandSurfaceM2("Terrain plat, arboré d'1 hectare")).toBe(10000);
  });

  it('refuses a footprint or level count even without a comma', () => {
    expect(parseLandSurfaceM2('Terrain arboré 120 m² au sol')).toBeNull();
    expect(parseLandSurfaceM2('Terrain avec emprise de 90 m²')).toBeNull();
  });

  it('keeps the plot area when another area follows it', () => {
    expect(parseLandSurfaceM2('Terrain de 600 m², maison de 90 m²')).toBe(600);
  });

  it('still refuses an area a comma hands to another building', () => {
    expect(parseLandSurfaceM2('Terrain, garage, 150 m² habitables')).toBeNull();
    expect(parseLandSurfaceM2('terrain clos, piscine de 32 m²')).toBeNull();
    expect(parseLandSurfaceM2('Terrain arboré, 4 chambres, 120 m²')).toBeNull();
    expect(
      parseLandSurfaceM2('Sur un terrain, une maison de 120 m²'),
    ).toBeNull();
    expect(parseLandSurfaceM2('Terrain arboré, maison de 120 m²')).toBeNull();
  });

  // why: these spaces are invisible and a \uXXXX escape has been flattened to
  // a plain space in this repo before, so they are built from their code point
  // and checked before use.
  it('joins a thousands group split by an invisible space', () => {
    for (const code of [0x00a0, 0x202f]) {
      const space = String.fromCharCode(code);
      const quote = `terrain de 1${space}200 m²`;
      expect(quote).toContain(space);
      expect(parseLandSurfaceM2(quote)).toBe(1200);
    }
  });
});
