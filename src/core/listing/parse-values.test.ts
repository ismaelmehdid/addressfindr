import { describe, expect, it } from 'vitest';
import {
  parseAnnualEnergyCostRange,
  parseBedroomCount,
  parseCity,
  parseCount,
  parseDpeDate,
  parseDpeEnergyValue,
  parseEnergyClass,
  parseFrenchNumber,
  parseGesEmissionValue,
  parseInseeCode,
  parsePostalCode,
  parsePriceEur,
  parsePropertyType,
  parseRoomCount,
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
    expect(parseEnergyClass('DPE : D', 'dpe')).toBe('D');
  });

  it('reads a letter after a long label', () => {
    expect(
      parseEnergyClass('Diagnostic de performance énergétique (DPE) C', 'dpe'),
    ).toBe('C');
  });

  it('reads a GES letter', () => {
    expect(parseEnergyClass('Émissions GES A', 'ges')).toBe('A');
  });

  it('refuses a full scale as ambiguous', () => {
    expect(parseEnergyClass('DPE A B C D E F G', 'dpe')).toBeNull();
  });

  it('refuses a letter with no energy context', () => {
    expect(parseEnergyClass('Bâtiment C', 'dpe')).toBeNull();
  });

  it('refuses marketing prose with no letter', () => {
    expect(
      parseEnergyClass('Bonne isolation (DPE conforme)', 'dpe'),
    ).toBeNull();
  });

  it('refuses a letter outside A-G', () => {
    expect(parseEnergyClass('DPE H', 'dpe')).toBeNull();
  });

  // why: regression — un quote GES ne doit jamais satisfaire dpeClass, et
  // inversement, meme quand la lettre elle-meme est valide.
  it('refuses a GES-only quote for the dpe metric', () => {
    expect(parseEnergyClass('Emissions GES B', 'dpe')).toBeNull();
  });

  it('refuses a DPE-only quote for the ges metric', () => {
    expect(parseEnergyClass('DPE B', 'ges')).toBeNull();
  });

  it('refuses a quote naming both metrics even for the correct one', () => {
    expect(parseEnergyClass('DPE C · GES C', 'dpe')).toBeNull();
    expect(parseEnergyClass('DPE C · GES C', 'ges')).toBeNull();
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

describe('parseRoomCount and parseBedroomCount', () => {
  it('refuses a bedrooms quote for rooms', () => {
    expect(parseRoomCount('3 chambres')).toBeNull();
  });

  it('reads a rooms quote', () => {
    expect(parseRoomCount('4 pièces')).toBe(4);
  });

  it('reads a bedrooms quote', () => {
    expect(parseBedroomCount('2 chambres')).toBe(2);
  });

  it('refuses a rooms quote for bedrooms', () => {
    expect(parseBedroomCount('4 pièces')).toBeNull();
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

describe('parseDpeEnergyValue', () => {
  it('reads the value off a standard DPE label', () => {
    expect(parseDpeEnergyValue('Consommation : 199 kWh/m²/an')).toBe(199);
  });

  it('accepts the primary-energy spelling and an ascii m2', () => {
    expect(parseDpeEnergyValue('logement 199 kWhEP/m2/an')).toBe(199);
  });

  it('joins a narrow no-break space used as thousands separator', () => {
    const narrowNbsp = String.fromCharCode(0x202f);
    const raw = `1${narrowNbsp}234 kWh/m²/an`;
    expect(raw).toContain(narrowNbsp);
    expect(parseDpeEnergyValue(raw)).toBe(1234);
  });

  it('refuses a total annual consumption with no per-surface marker', () => {
    expect(parseDpeEnergyValue('Chauffage 1822 kWh par an')).toBeNull();
  });

  it('refuses a GES quote', () => {
    expect(parseDpeEnergyValue('40 kg CO₂/m²/an')).toBeNull();
  });

  // why: ADEME's conso_5_usages_par_m2_ep is primary energy. Leboncoin
  // descriptions print both lines, and the final-energy one was quoted.
  it('refuses a final-energy figure', () => {
    expect(
      parseDpeEnergyValue('Consommation énergie finale : 104.00 kWh/m²/an'),
    ).toBeNull();
  });

  it('reads a primary-energy figure', () => {
    expect(
      parseDpeEnergyValue('Consommation énergie primaire : 240 kWh/m²/an'),
    ).toBe(240);
  });

  it('reads only the energy figure from a combined label', () => {
    expect(parseDpeEnergyValue('199 kWh/m²/an et 40 kg CO₂/m²/an')).toBe(199);
  });
});

describe('parseGesEmissionValue', () => {
  it('reads the value off a standard GES label', () => {
    expect(parseGesEmissionValue('40 kg CO₂/m²/an')).toBe(40);
  });

  it('accepts the ascii CO2 spelling with an equivalence marker', () => {
    expect(parseGesEmissionValue('40 kg éq. CO2/m2/an')).toBe(40);
  });

  it('accepts the unspaced unit', () => {
    expect(parseGesEmissionValue('emissions 12 kgCO2/m²/an')).toBe(12);
  });

  it('refuses a DPE quote', () => {
    expect(parseGesEmissionValue('199 kWh/m²/an')).toBeNull();
  });

  it('reads only the emission figure from a combined label', () => {
    expect(parseGesEmissionValue('199 kWh/m²/an et 40 kg CO₂/m²/an')).toBe(40);
  });
});

describe('parseDpeDate', () => {
  it('reads the leboncoin diagnostic line', () => {
    expect(
      parseDpeDate(
        'Date de réalisation du diagnostic énergétique : 14/04/2022',
      ),
    ).toBe('2022-04-14');
  });

  it('accepts dotted and dashed day-first dates', () => {
    expect(parseDpeDate('DPE réalisé le 14.04.2022')).toBe('2022-04-14');
    expect(parseDpeDate('DPE réalisé le 14-04-2022')).toBe('2022-04-14');
  });

  it('accepts an iso date', () => {
    expect(parseDpeDate('Date du DPE : 2022-04-14')).toBe('2022-04-14');
  });

  it('accepts a spelled-out month', () => {
    expect(parseDpeDate('Diagnostic réalisé le 3 août 2025')).toBe(
      '2025-08-03',
    );
  });

  it('refuses a date that does not exist', () => {
    expect(parseDpeDate('DPE réalisé le 31/02/2022')).toBeNull();
  });

  it('refuses a quote that does not name the diagnostic', () => {
    expect(parseDpeDate('Annonce mise en ligne le 14/04/2022')).toBeNull();
  });

  it('refuses a quote carrying two different dates', () => {
    expect(
      parseDpeDate('DPE réalisé le 14/04/2022, valable jusqu’au 13/04/2032'),
    ).toBeNull();
  });

  it('refuses a date in the future', () => {
    const nextYear = new Date().getFullYear() + 1;
    expect(parseDpeDate(`DPE réalisé le 01/01/${nextYear}`)).toBeNull();
  });
});

describe('parseAnnualEnergyCostRange', () => {
  it('reads the range of the standard label sentence', () => {
    expect(
      parseAnnualEnergyCostRange(
        "Montant estimé des dépenses annuelles d'énergie pour un usage standard : entre 1 290 € et 1 790 € par an. Prix moyens des énergies indexés sur l'année 2021",
      ),
    ).toEqual({ min: 1290, max: 1790 });
  });

  it('reads the leboncoin summary without a currency after the lower bound', () => {
    expect(parseAnnualEnergyCostRange('entre 1290 et 1 790 € par an')).toEqual({
      min: 1290,
      max: 1790,
    });
  });

  it('joins digit groups split by a narrow no-break space', () => {
    const narrow = String.fromCharCode(0x202f);
    const quote = `entre 1${narrow}290 € et 1${narrow}790 € par an`;
    expect(quote.includes(narrow)).toBe(true);
    expect(parseAnnualEnergyCostRange(quote)).toEqual({ min: 1290, max: 1790 });
  });

  it('refuses a single amount', () => {
    expect(parseAnnualEnergyCostRange('1 790 € par an')).toBeNull();
  });

  it('refuses an inverted range', () => {
    expect(parseAnnualEnergyCostRange('entre 1 790 € et 1 290 €')).toBeNull();
  });
});
