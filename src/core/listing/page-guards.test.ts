import { describe, expect, it } from 'vitest';
import { isUnsupportedCategory, looksBlocked } from './page-guards';

describe('looksBlocked', () => {
  it('flags an explicit 403', () => {
    expect(looksBlocked({ markdown: 'anything', statusCode: 403 })).toBe(true);
  });

  it('flags an explicit 429', () => {
    expect(looksBlocked({ markdown: 'anything', statusCode: 429 })).toBe(true);
  });

  it('flags a short page carrying a challenge url', () => {
    expect(
      looksBlocked({
        markdown: 'Vérification… geo.captcha-delivery.com',
        statusCode: 200,
      }),
    ).toBe(true);
  });

  it('does NOT flag a short page just because an anti-bot vendor is named', () => {
    // ~1.4k chars: sous le seuil, donc la liste de marqueurs EST consultée.
    // "datadome" n'en fait pas partie — c'est le garde-fou contre le faux
    // positif observé pendant la recherche (le script est sur toutes les pages).
    const markdown = `${'Duplex 4 pièces 102 m² '.repeat(60)} datadome`;
    expect(markdown.length).toBeLessThan(1500);
    expect(looksBlocked({ markdown, statusCode: 200 })).toBe(false);
  });

  it('does NOT flag a long page that happens to contain a challenge string', () => {
    const markdown = `${'Appartement 4 pièces 80 m² '.repeat(100)} geo.captcha-delivery.com`;
    expect(markdown.length).toBeGreaterThan(1500);
    expect(looksBlocked({ markdown, statusCode: 200 })).toBe(false);
  });

  it('does NOT flag a normal page', () => {
    const markdown = 'Appartement 4 pièces 80 m² '.repeat(60);
    expect(looksBlocked({ markdown, statusCode: 200 })).toBe(false);
  });
});

describe('isUnsupportedCategory', () => {
  it('flags a building plot', () => {
    expect(isUnsupportedCategory('Terrain constructible de 600 m²')).toBe(true);
  });

  it('flags commercial premises', () => {
    expect(isUnsupportedCategory('Local commercial 45 m²')).toBe(true);
  });

  it('flags a lone parking space', () => {
    expect(isUnsupportedCategory('Vente place de parking')).toBe(true);
  });

  it('does not flag a flat that merely mentions a garage', () => {
    expect(
      isUnsupportedCategory('Appartement 4 pièces avec garage et balcon'),
    ).toBe(false);
  });

  it('does not flag a house', () => {
    expect(isUnsupportedCategory('Maison 5 pièces avec terrain arboré')).toBe(
      false,
    );
  });
});
