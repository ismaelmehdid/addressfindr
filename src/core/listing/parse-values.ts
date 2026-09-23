import {
  ENERGY_CLASSES,
  type EnergyClass,
  type HeatingEnergy,
  type PropertyType,
  type TransactionType,
} from './types';

const SPACE_VARIANTS = /[     ]/g;

function joinDigitGroups(raw: string): string {
  let s = raw.replace(SPACE_VARIANTS, ' ');
  while (/\d \d{3}(?!\d)/.test(s)) {
    s = s.replace(/(\d) (\d{3})(?!\d)/, '$1$2');
  }
  return s;
}

export function parseFrenchNumber(raw: string): number | null {
  const s = joinDigitGroups(raw);
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

const DPE_CONTEXT = /\bdpe\b|consommation|[ée]nerg/i;
const GES_CONTEXT = /\bges\b|effet de serre|[ée]mission/i;
const STANDALONE_LETTER = /(?<![\p{L}])([A-Ga-g])(?![\p{L}])/gu;

export function parseEnergyClass(
  raw: string,
  metric: 'dpe' | 'ges',
): EnergyClass | null {
  const wanted = metric === 'dpe' ? DPE_CONTEXT : GES_CONTEXT;
  const other = metric === 'dpe' ? GES_CONTEXT : DPE_CONTEXT;
  if (!wanted.test(raw) || other.test(raw)) return null;
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

// why: exiger le marqueur par-surface. Une annonce peut citer la consommation
// annuelle totale ("1822 kWh"), qui n'est pas la valeur portee par l'etiquette
// DPE et ne correspond a aucune colonne ADEME.
const DPE_ENERGY_PATTERN =
  /(\d{1,4}(?:[.,]\d{1,2})?)\s*k\s?wh[^\d]{0,12}?m\s?[2\u00B2]/i;
const GES_EMISSION_PATTERN =
  /(\d{1,4}(?:[.,]\d{1,2})?)\s*kg[^\d]{0,16}?co\s?[2\u2082][^\d]{0,12}?m\s?[2\u00B2]/i;

export function parseDpeEnergyValue(raw: string): number | null {
  const match = DPE_ENERGY_PATTERN.exec(joinDigitGroups(raw));
  return match?.[1] ? parseFrenchNumber(match[1]) : null;
}

export function parseGesEmissionValue(raw: string): number | null {
  const match = GES_EMISSION_PATTERN.exec(joinDigitGroups(raw));
  return match?.[1] ? parseFrenchNumber(match[1]) : null;
}

// why: le libelle doit nommer le chauffage, pas l'eau chaude seule, sinon une
// annonce "eau chaude sanitaire au gaz" ferait croire a un chauffage au gaz.
const HEATING_SUBJECT =
  /chauff|chaudi[èe]re|po[êe]le|radiateur|convecteur|r[ée]seau de chaleur/i;

const HEATING_ENERGY_WORDS: readonly [RegExp, HeatingEnergy][] = [
  [/\bgaz\b|\bgpl\b(?= ?naturel)/i, 'gas'],
  [/[ée]lectri/i, 'electricity'],
  [/urbain|r[ée]seau de chaleur/i, 'district-heating'],
  [/fioul|mazout/i, 'fuel-oil'],
  [/\bbois\b|granul[ée]s?|pellets?|b[ûu]ches?|plaquettes?/i, 'wood'],
  [/propane|butane|\bgpl\b/i, 'lpg'],
  [/charbon/i, 'coal'],
];

// why: une pompe a chaleur ne dit pas son energie dans l'ADEME de facon
// fiable. Deviner "electricite" ecarterait la bonne ligne quand le registre la
// range autrement.
const HEATING_AMBIGUOUS = /pompe [àa] chaleur|\bpac\b|g[ée]othermi/i;

export function parseHeatingEnergy(raw: string): HeatingEnergy | null {
  if (!HEATING_SUBJECT.test(raw)) return null;
  if (HEATING_AMBIGUOUS.test(raw)) return null;

  const found = new Set<HeatingEnergy>();
  for (const [pattern, energy] of HEATING_ENERGY_WORDS) {
    if (pattern.test(raw)) found.add(energy);
  }
  if (found.size !== 1) return null;
  const [only] = [...found];
  return only ?? null;
}

export function parseCount(raw: string): number | null {
  const value = parseFrenchNumber(raw);
  if (value === null) return null;
  return Number.isInteger(value) ? value : null;
}

const ROOMS_SUBJECT = /pi[èe]ces?|\bT[1-9]\b|\bF[1-9]\b/i;
const BEDROOMS_SUBJECT = /chambres?/i;

export function parseRoomCount(raw: string): number | null {
  if (!ROOMS_SUBJECT.test(raw) || BEDROOMS_SUBJECT.test(raw)) return null;
  return parseCount(raw);
}

export function parseBedroomCount(raw: string): number | null {
  if (!BEDROOMS_SUBJECT.test(raw)) return null;
  return parseCount(raw);
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
