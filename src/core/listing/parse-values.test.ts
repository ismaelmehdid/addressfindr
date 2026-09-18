import { describe, expect, it } from 'vitest';
import {
  parseCity,
  parseCount,
  parseEnergyClass,
  parseFrenchNumber,
  parseInseeCode,
  parsePostalCode,
  parsePriceEur,
  parsePropertyType,
  parseSurfaceM2,
  parseTransactionType,
  parseYear,
} from './parse-values';

describe('parseFrenchNumber', () => {
  it('handles the decimal comma', () => {
    expect(parseFrenchNumber('68,5')).toBe(68.5);
  });

  it('handles a plain space as thousands separator', () => {
    expect(parseFrenchNumber('365 000')).toBe(365000);
  });

  it('handles a non-breaking space as thousands separator', () => {
    expect(parseFrenchNumber('365 000')).toBe(365000);
  });

  it('handles several thousands groups', () => {
    expect(parseFrenchNumber('1 234 567')).toBe(1234567);
  });

  it('returns null when there is no digit', () => {
    expect(parseFrenchNumber('abc')).toBeNull();
  });
});

describe('parseSurfaceM2', () => {
  it('reads a surface with a decimal comma', () => {
    expect(parseSurfaceM2('Surface habitable : 68,5 m²')).toBe(68.5);
  });

  it('accepts the m2 spelling', () => {
    expect(parseSurfaceM2('19,57 m2')).toBe(19.57);
  });

  it('refuses a land surface', () => {
    expect(parseSurfaceM2('terrain de 300 m²')).toBeNull();
  });

  it('refuses a room surface', () => {
    expect(parseSurfaceM2('séjour de 24 m²')).toBeNull();
  });

  it('refuses a balcony surface', () => {
    expect(parseSurfaceM2('balcon 8 m²')).toBeNull();
  });

  it('returns null when no unit is present', () => {
    expect(parseSurfaceM2('68,5')).toBeNull();
  });
});

describe('parseEnergyClass', () => {
  it('reads a labelled DPE letter', () => {
    expect(parseEnergyClass('DPE : D')).toBe('D');
  });

  it('reads a letter after a long label', () => {
    expect(
      parseEnergyClass('Diagnostic de performance énergétique (DPE) C'),
    ).toBe('C');
  });

  it('reads a GES letter', () => {
    expect(parseEnergyClass('Émissions GES A')).toBe('A');
  });

  it('refuses a full scale as ambiguous', () => {
    expect(parseEnergyClass('DPE A B C D E F G')).toBeNull();
  });

  it('refuses a letter with no energy context', () => {
    expect(parseEnergyClass('Bâtiment C')).toBeNull();
  });

  it('refuses marketing prose with no letter', () => {
    expect(parseEnergyClass('Bonne isolation (DPE conforme)')).toBeNull();
  });

  it('refuses a letter outside A-G', () => {
    expect(parseEnergyClass('DPE H')).toBeNull();
  });
});

describe('parseCount', () => {
  it('reads a room count', () => {
    expect(parseCount('4 pièces')).toBe(4);
  });

  it('reads a bare integer', () => {
    expect(parseCount('2')).toBe(2);
  });

  it('refuses a decimal', () => {
    expect(parseCount('2,5')).toBeNull();
  });

  it('returns null with no digit', () => {
    expect(parseCount('studio')).toBeNull();
  });
});

describe('parseYear', () => {
  it('reads a build year', () => {
    expect(parseYear('Résidence construite en 2005')).toBe(2005);
  });

  it('returns null for a two digit number', () => {
    expect(parseYear('en 05')).toBeNull();
  });
});

describe('parsePriceEur', () => {
  it('reads a price with spaces and a currency sign', () => {
    expect(parsePriceEur('249 900 €')).toBe(249900);
  });

  it('handles narrow no-break space in prices', () => {
    expect(parsePriceEur('249 900 €')).toBe(249900);
  });
});

describe('parsePostalCode and parseInseeCode', () => {
  it('reads a postal code inside a label', () => {
    expect(parsePostalCode('Hardricourt (78250)')).toBe('78250');
  });

  it('refuses a four digit number', () => {
    expect(parsePostalCode('7825')).toBeNull();
  });

  it('reads a corsican insee code', () => {
    expect(parseInseeCode('2A004')).toBe('2A004');
    expect(parseInseeCode('2B033')).toBe('2B033');
  });

  it('reads a mainland insee code', () => {
    expect(parseInseeCode('commune 78250')).toBe('78250');
  });

  it('refuses a four character code', () => {
    expect(parseInseeCode('7825')).toBeNull();
  });

  it('refuses a letter that is not A or B', () => {
    expect(parseInseeCode('2C004')).toBeNull();
  });
});

describe('parsePropertyType and parseTransactionType', () => {
  it('maps appartement', () => {
    expect(parsePropertyType('Appartement 3 pièces')).toBe('apartment');
  });

  it('maps maison', () => {
    expect(parsePropertyType('Maison de village')).toBe('house');
  });

  it('maps studio to apartment', () => {
    expect(parsePropertyType('Studio')).toBe('apartment');
  });

  it('returns null for an unsupported category', () => {
    expect(parsePropertyType('Terrain constructible')).toBeNull();
  });

  it('maps a sale', () => {
    expect(parseTransactionType('Vente appartement')).toBe('sale');
  });

  it('maps a rental', () => {
    expect(parseTransactionType('Location appartement')).toBe('rent');
  });
});

describe('parseCity', () => {
  it('strips a trailing postal code in parentheses', () => {
    expect(parseCity('Hardricourt (78250)')).toBe('Hardricourt');
  });

  it('keeps an arrondissement label', () => {
    expect(parseCity('Paris 11e')).toBe('Paris 11e');
  });

  it('returns null for an empty string', () => {
    expect(parseCity('   ')).toBeNull();
  });
});
