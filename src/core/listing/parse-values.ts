import {
  ENERGY_CLASSES,
  type EnergyClass,
  type PropertyType,
  type TransactionType,
} from './types';

const SPACE_VARIANTS = /[     ]/g;

export function parseFrenchNumber(raw: string): number | null {
  let s = raw.replace(SPACE_VARIANTS, ' ');
  while (/\d \d{3}(?!\d)/.test(s)) {
    s = s.replace(/(\d) (\d{3})(?!\d)/, '$1$2');
  }
  const match = /-?\d+(?:[.,]\d+)?/.exec(s);
  if (!match) return null;
  const value = Number.parseFloat(match[0].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

const SURFACE_EXCLUSIONS =
  /terrain|s[ée]jour|balcon|terrasse|jardin|cave|garage|parking|combles?|grenier|cellier|loggia/i;
const SURFACE_PATTERN = /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:m²|m2|M²|M2)/;

export function parseSurfaceM2(raw: string): number | null {
  if (SURFACE_EXCLUSIONS.test(raw)) return null;
  const match = SURFACE_PATTERN.exec(raw.replace(SPACE_VARIANTS, ' '));
  if (!match || !match[1]) return null;
  return parseFrenchNumber(match[1]);
}

const ENERGY_CONTEXT = /dpe|ges|[ée]nerg|effet de serre|consommation/i;
const STANDALONE_LETTER = /(?<![\p{L}])([A-Ga-g])(?![\p{L}])/gu;

export function parseEnergyClass(raw: string): EnergyClass | null {
  if (!ENERGY_CONTEXT.test(raw)) return null;
  const found = raw.match(STANDALONE_LETTER);
  if (!found || found.length === 0) return null;
  const unique = [...new Set(found.map((l) => l.toUpperCase()))];
  // why: une échelle A→G entière est ambiguë — mieux vaut rien que la mauvaise lettre
  if (unique.length !== 1) return null;
  const letter = unique[0];
  if (!letter) return null;
  return (ENERGY_CLASSES as readonly string[]).includes(letter)
    ? (letter as EnergyClass)
    : null;
}

export function parseCount(raw: string): number | null {
  const value = parseFrenchNumber(raw);
  if (value === null) return null;
  return Number.isInteger(value) ? value : null;
}

export function parseYear(raw: string): number | null {
  const match = /(?<!\d)(1[6-9]\d{2}|2[01]\d{2})(?!\d)/.exec(raw);
  if (!match || !match[1]) return null;
  return Number.parseInt(match[1], 10);
}

export function parsePriceEur(raw: string): number | null {
  const value = parseFrenchNumber(raw);
  if (value === null) return null;
  return Number.isFinite(value) ? Math.round(value) : null;
}

export function parsePostalCode(raw: string): string | null {
  const match = /(?<!\d)(\d{5})(?!\d)/.exec(raw);
  return match && match[1] ? match[1] : null;
}

// why: un code INSEE fait exactement 5 caracteres — soit 5 chiffres,
// soit le format corse 2A/2B (ex. 2A004). Les deux alternatives sont
// necessaires : \d{5} seul rejette la Corse, [0-9AB]\d{4} aussi.
export function parseInseeCode(raw: string): string | null {
  const match = /(?<![0-9A-Za-z])(\d[AB]\d{3}|\d{5})(?![0-9A-Za-z])/.exec(raw);
  return match && match[1] ? match[1].toUpperCase() : null;
}

const HOUSE_WORDS = /maison|villa|pavillon|propri[ée]t[ée]|ch[âa]teau|longère/i;
const APARTMENT_WORDS =
  /appartement|studio|duplex|triplex|loft|t[1-9]\b|f[1-9]\b/i;

export function parsePropertyType(raw: string): PropertyType | null {
  if (HOUSE_WORDS.test(raw)) return 'house';
  if (APARTMENT_WORDS.test(raw)) return 'apartment';
  return null;
}

export function parseTransactionType(raw: string): TransactionType | null {
  if (/location|louer|\blouer\b|\brent\b/i.test(raw)) return 'rent';
  if (/vente|vendre|achat|acheter|\bsell\b/i.test(raw)) return 'sale';
  return null;
}

export function parseCity(raw: string): string | null {
  const cleaned = raw
    .replace(SPACE_VARIANTS, ' ')
    .replace(/\(\s*\d{5}\s*\)/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function parseStreetAddress(raw: string): string | null {
  const cleaned = raw.replace(SPACE_VARIANTS, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length >= 3 ? cleaned : null;
}
