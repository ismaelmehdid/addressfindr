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

// why: a house listing states its plot, which ADEME lacks and the cadastre
// has. Living area and plot area read alike, and one sentence often carries
// both ("maison de 120 m² sur un terrain de 800 m²"): comparing a living room
// to a parcel would penalise the true house. So only an area attached to the
// word naming the plot counts, and a quote naming the living area, a garden or
// a terrace is refused outright.
const LAND_SUBJECT = /terrain|parcelle/gi;
const LAND_EXCLUSIONS =
  /habitable|carrez|jardin|terrasse|balcon|s[ée]jour|cave|garage|piscine/i;

const SQUARE_METRES_PER_ARE = 100;
const SQUARE_METRES_PER_HECTARE = 10_000;

// why: the lookbehind refuses the tail of "1.200 m²", a dotted thousands
// group no parser here can read safely.
const LAND_AREAS: readonly (readonly [RegExp, number])[] = [
  [/(?<![\d.,])(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:m²|m2)/gi, 1],
  [/(?<![\d.,])(\d{1,5}(?:[.,]\d{1,2})?)\s*ares?\b/gi, SQUARE_METRES_PER_ARE],
  [
    /(?<![\d.,])(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:hectares?|ha)\b/gi,
    SQUARE_METRES_PER_HECTARE,
  ],
];

// why: between the plot word and its area there may only be words — no other
// number, no sentence break, and no other building the area could belong to.
// After a comma the next area usually describes the house, so a comma is
// accepted only when the lead-in hands the area back to the plot with "de"
// ("terrain plat, clos et arboré de 1000 m²").
const LAND_LEAD_IN = /^[^\d.;!?\n]{0,40}$/;
const LAND_LEAD_IN_OWNED = /(?:\bde\s+|\bd['’]\s*)$/i;
const OTHER_BUILT_SUBJECT =
  /maison|appartement|villa|pavillon|logement|habitation|b[aâ]ti|d[ée]pendance|hangar|grange|atelier|pi[èe]ce|chambre|salon|emprise|au sol/i;
const LAND_TRAILER = /^\s*d(?:e\s+|['’]\s*)(?:terrain|parcelle)/i;
// why: "120 m² au sol" or "110 m² sur deux niveaux" is the house. The words
// disqualify the area they follow, never the plot area in the same quote.
const BUILT_AREA_TRAILER =
  /^\s*(?:au sol|d['’]emprise|de plain[\s-]?pied|habitables?|sur \S+ niveaux)/i;

type LandArea = { start: number; end: number; squareMetres: number };

function landAreas(text: string): LandArea[] {
  const areas: LandArea[] = [];
  for (const [pattern, factor] of LAND_AREAS) {
    for (const match of text.matchAll(pattern)) {
      const value = match[1] ? parseFrenchNumber(match[1]) : null;
      if (value === null) continue;
      areas.push({
        start: match.index,
        end: match.index + match[0].length,
        squareMetres: Math.round(value * factor),
      });
    }
  }
  return areas;
}

function isAttachedToLand(text: string, area: LandArea): boolean {
  const trailer = text.slice(area.end);
  if (BUILT_AREA_TRAILER.test(trailer)) return false;
  if (LAND_TRAILER.test(trailer)) return true;
  for (const subject of text.matchAll(LAND_SUBJECT)) {
    const subjectEnd = subject.index + subject[0].length;
    if (subjectEnd > area.start) break;
    if (isPlotLeadIn(text.slice(subjectEnd, area.start))) return true;
  }
  return false;
}

function isPlotLeadIn(leadIn: string): boolean {
  if (!LAND_LEAD_IN.test(leadIn) || OTHER_BUILT_SUBJECT.test(leadIn)) {
    return false;
  }
  return !leadIn.includes(',') || LAND_LEAD_IN_OWNED.test(leadIn);
}

export function parseLandSurfaceM2(raw: string): number | null {
  if (LAND_EXCLUSIONS.test(raw)) return null;

  const text = joinDigitGroups(raw);
  const attached = new Set(
    landAreas(text)
      .filter((area) => isAttachedToLand(text, area))
      .map((area) => area.squareMetres),
  );
  if (attached.size !== 1) return null;
  const [only] = [...attached];
  return only ?? null;
}

const DPE_CONTEXT = /\bdpe\b|consommation|[ée]nerg/i;
const GES_CONTEXT = /\bges\b|effet de serre|[ée]mission/i;
// why: the apostrophe lookahead drops the elided "d'" and "c'" of French prose.
const STANDALONE_LETTER = /(?<![\p{L}])([A-Ga-g])(?![\p{L}'’])/gu;

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

// why: the floor, the building height and a room count share one phrase
// ("3 pièces au 2e étage sur 5"), so each number is read from its own slot,
// never as the first number of the quote. Folding turns "2ème", "2ᵉ" and
// "ÉTAGE" into plain ASCII before matching.
function foldFloorText(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/’/g, "'")
    .toLowerCase();
}

function singleCapturedCount(
  text: string,
  patterns: readonly RegExp[],
): number | null {
  const found = new Set<number>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) found.add(Number.parseInt(match[1], 10));
    }
  }
  if (found.size !== 1) return null;
  const [only] = [...found];
  return only ?? null;
}

// why: "rez-de-chaussée" also names a house's ground level, so it has never
// resolved to a floor.
const GROUND_FLOOR = /\brez[\s-]*de\b|\brdc\b/;
const FLOOR_RANGE =
  /\d\s*(?:er|ere|re|nde|nd|eme|ieme|e)\s+(?:au|a|et)\s+\d{1,2}\s*(?:er|ere|re|nde|nd|eme|ieme|e)\b/;
const FLOOR_ORDINAL =
  /(?<![\p{L}\d])(\d{1,2})\s*(?:er|ere|re|nde|nd|eme|ieme|e)\s*(?:et\s+dernier\s+)?etage(?!s)/gu;
const FLOOR_LABEL = /(?<![\p{L}'])etage\s*:\s*(\d{1,2})(?!\d)/gu;
// why: a bare "Étage N" is a label only where it opens a line or a list item.
// In prose ("dernier étage 3 pièces") the number counts something else.
const FLOOR_LABEL_BARE =
  /(?<![\p{L}\d'][ \t]*)etage[ \t]+(\d{1,2})(?![\d.,]?\d)(?![ \t]*(?:\d|pieces?\b|chambres?\b|m2))/gu;

export function parseFloor(raw: string): number | null {
  const text = foldFloorText(raw);
  if (GROUND_FLOOR.test(text) || FLOOR_RANGE.test(text)) return null;
  return singleCapturedCount(text, [
    FLOOR_ORDINAL,
    FLOOR_LABEL,
    FLOOR_LABEL_BARE,
  ]);
}

const STOREYS_ABOVE_FLOOR = /etage\s+sur\s+(\d{1,2})(?!\d)(?!\s*niveau)/g;
const STOREYS_OF_LABEL =
  /(?<![\p{L}'])etage\s*:?\s*\d{1,2}\s*(?:\/|sur)\s*(\d{1,2})(?!\d)(?!\s*niveau)/gu;
// why: words between the label and its number ("dans l'immeuble") are only
// read up to a colon, so no later number can be taken for the count.
const STOREY_COUNT_LABEL =
  /nombre\s+d'\s*etages?(?:(?:\s+[a-z']+){1,4}\s*:|\s*:?)\s*(\d{1,2})(?!\d)/g;
// why: "sur 2 étages" and "duplex de 2 étages" count the dwelling's own
// levels, not the building's.
const STOREY_COUNT = /(?<![\p{L}\d.,])(?<!sur\s+)(\d{1,2})\s*etages\b/gu;
const DWELLING_SPANS_LEVELS = /duplex|triplex/;
const BUILDING_STOREY_PATTERNS = [
  STOREYS_ABOVE_FLOOR,
  STOREYS_OF_LABEL,
  STOREY_COUNT_LABEL,
];

export function parseBuildingFloors(raw: string): number | null {
  const text = foldFloorText(raw);
  return singleCapturedCount(
    text,
    DWELLING_SPANS_LEVELS.test(text)
      ? BUILDING_STOREY_PATTERNS
      : [...BUILDING_STOREY_PATTERNS, STOREY_COUNT],
  );
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
