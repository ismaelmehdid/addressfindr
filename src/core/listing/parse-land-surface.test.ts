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
});
