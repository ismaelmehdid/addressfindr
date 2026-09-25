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

// why: une annonce de maison chiffre son terrain, et l'ADEME n'a pas cette
// donnee — le cadastre si. Mais surface habitable et surface de terrain se
// ressemblent dans un texte : confondre les deux ferait comparer un salon a
// une parcelle. Le libelle doit donc nommer la parcelle, et ne nommer ni
// l'habitable, ni un jardin, ni une terrasse, qui ne sont pas le terrain.
const LAND_SUBJECT = /terrain|parcelle/i;
const LAND_EXCLUSIONS =
  /habitable|carrez|jardin|terrasse|balcon|s[ée]jour|cave|garage|piscine/i;
const LAND_M2_PATTERN = /(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:m²|m2|M²|M2)/;
const LAND_ARE_PATTERN = /(\d{1,5}(?:[.,]\d{1,2})?)\s*ares?\b/i;
const LAND_HECTARE_PATTERN = /(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:hectares?|ha)\b/i;

const SQUARE_METRES_PER_ARE = 100;
const SQUARE_METRES_PER_HECTARE = 10_000;

export function parseLandSurfaceM2(raw: string): number | null {
  if (!LAND_SUBJECT.test(raw)) return null;
  if (LAND_EXCLUSIONS.test(raw)) return null;

  const text = joinDigitGroups(raw);
  for (const [pattern, factor] of [
    [LAND_HECTARE_PATTERN, SQUARE_METRES_PER_HECTARE],
    [LAND_ARE_PATTERN, SQUARE_METRES_PER_ARE],
    [LAND_M2_PATTERN, 1],
  ] as const) {
    const match = pattern.exec(text);
    if (!match?.[1]) continue;
    const value = parseFrenchNumber(match[1]);
    if (value === null) continue;
    return Math.round(value * factor);
  }
  return null;
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

// why: ADEME's conso_5_usages_par_m2_ep is primary energy; a final-energy
// figure sits on the same label and would never match it.
const FINAL_ENERGY = /[ée]nergie finale|\bef\b/i;

export function parseDpeEnergyValue(raw: string): number | null {
  if (FINAL_ENERGY.test(raw)) return null;
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

// why: the DPE date is the establishment date ADEME publishes. Only its label
// tells it apart from a listing publication date, hence the required context.
// Two different dates in one quote — carried out on, valid until — make the
// right one undecidable.
const DPE_DATE_CONTEXT = /diagnostic|\bdpe\b|[ée]nerg/i;
const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};
const NUMERIC_DATE = /(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/g;
const ISO_DATE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const SPELLED_DATE = /(?<!\d)(\d{1,2})(?:er)?\s+([a-z]+)\s+(\d{4})(?!\d)/g;
const FIRST_DPE_YEAR = 2006;

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  if (year < FIRST_DPE_YEAR || date.getTime() > Date.now()) return null;
  return date.toISOString().slice(0, 10);
}

export function parseDpeDate(raw: string): string | null {
  if (!DPE_DATE_CONTEXT.test(raw)) return null;
  const folded = raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(SPACE_VARIANTS, ' ');

  const found: (string | null)[] = [];
  for (const [, day, month, year] of folded.matchAll(NUMERIC_DATE)) {
    found.push(isoDate(Number(year), Number(month), Number(day)));
  }
  for (const [, year, month, day] of folded.matchAll(ISO_DATE)) {
    found.push(isoDate(Number(year), Number(month), Number(day)));
  }
  for (const [, day, monthName, year] of folded.matchAll(SPELLED_DATE)) {
    const month = FRENCH_MONTHS[monthName ?? ''];
    if (month !== undefined) {
      found.push(isoDate(Number(year), month, Number(day)));
    }
  }

  const unique = new Set(found);
  if (unique.size !== 1) return null;
  const [only] = [...unique];
  return only ?? null;
}

// why: the label prints an annual cost range, not a value. Both bounds must be
// read in the same sentence: a lone amount can be a rent, service charges or a
// price, and a year ("indexes sur l'annee 2021") often follows the range.
const ENERGY_COST_RANGE =
  /entre\s+(\d[\d ]*(?:[.,]\d+)?)\s*(?:€|euros?)?\s+et\s+(\d[\d ]*(?:[.,]\d+)?)\s*(?:€|euros?)/i;

export function parseAnnualEnergyCostRange(
  raw: string,
): { min: number; max: number } | null {
  const match = ENERGY_COST_RANGE.exec(joinDigitGroups(raw));
  if (!match?.[1] || !match[2]) return null;
  const min = parseFrenchNumber(match[1]);
  const max = parseFrenchNumber(match[2]);
  if (min === null || max === null || min >= max) return null;
  return { min, max };
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
