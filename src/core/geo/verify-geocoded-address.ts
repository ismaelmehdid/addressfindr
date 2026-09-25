import type { GeocodedAddress, RawStreetLine } from './types';

const STREET_TYPES = new Set([
  'allee',
  'avenue',
  'boulevard',
  'chemin',
  'cite',
  'clos',
  'cours',
  'domaine',
  'esplanade',
  'faubourg',
  'hameau',
  'impasse',
  'lotissement',
  'mail',
  'montee',
  'parvis',
  'passage',
  'place',
  'promenade',
  'quai',
  'rampe',
  'residence',
  'route',
  'rue',
  'ruelle',
  'sentier',
  'square',
  'venelle',
  'voie',
]);

const ABBREVIATIONS: Record<string, string> = {
  all: 'allee',
  av: 'avenue',
  ave: 'avenue',
  bd: 'boulevard',
  bld: 'boulevard',
  blvd: 'boulevard',
  bvd: 'boulevard',
  ch: 'chemin',
  che: 'chemin',
  chem: 'chemin',
  crs: 'cours',
  fbg: 'faubourg',
  imp: 'impasse',
  pl: 'place',
  rte: 'route',
  sq: 'square',
  cdt: 'commandant',
  dr: 'docteur',
  gal: 'general',
  gen: 'general',
  mal: 'marechal',
  pdt: 'president',
  prof: 'professeur',
  st: 'saint',
  ste: 'sainte',
};

const STOPWORDS = new Set([
  'a',
  'au',
  'aux',
  'd',
  'de',
  'des',
  'du',
  'en',
  'et',
  'l',
  'la',
  'le',
  'les',
  'sous',
  'sur',
]);

const NUMBER_SUFFIXES: Record<string, string> = {
  b: 'bis',
  t: 'ter',
  q: 'quater',
};

// why: a numbered line is a house number, an optional suffix, then a street
// that starts with a letter. "1ER ETAGE" and "4eme" glue letters to the digits
// and are floors; "2/4/6/8 RUE" and "64 68 COURS" carry several numbers and
// cannot name one door.
const NUMBERED_LINE =
  /^(\d{1,4})\s*(bis|ter|quater|[a-z])?(?![\p{L}\d])[\s,]*(\p{L}.*)$/iu;
const BARE_NUMBER = /^\d{1,4}\s*(bis|ter|quater|[a-z])?$/i;

function tokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 0)
    .map((token) => ABBREVIATIONS[token] ?? token);
}

function normalizeHouseNumber(raw: string): string {
  const compact = raw.toLowerCase().replace(/\s+/g, '');
  const match = /^(\d+)([a-z]*)$/.exec(compact);
  if (!match?.[1]) return compact;
  const suffix = match[2] ?? '';
  return `${match[1]}${NUMBER_SUFFIXES[suffix] ?? suffix}`;
}

function streetParts(street: string): {
  streetType: string | null;
  words: string[];
} {
  const all = tokens(street);
  const first = all[0];
  const streetType =
    first !== undefined && STREET_TYPES.has(first) ? first : null;
  const rest = streetType === null ? all : all.slice(1);
  return {
    streetType,
    words: rest.filter((token) => !STOPWORDS.has(token)),
  };
}

function segments(raw: string): string[] {
  const parts = raw
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const joined: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] ?? '';
    const next = parts[i + 1];
    if (BARE_NUMBER.test(part) && next !== undefined) {
      joined.push(`${part} ${next}`);
      i += 1;
    } else {
      joined.push(part);
    }
  }
  return joined;
}

export function parseRawStreetLine(raw: string): RawStreetLine | null {
  const numbered = segments(raw)
    .map((segment) => NUMBERED_LINE.exec(segment))
    .filter((match): match is RegExpExecArray => match !== null);
  if (numbered.length !== 1) return null;

  const [match] = numbered;
  const digits = match?.[1];
  const street = match?.[3];
  if (digits === undefined || street === undefined) return null;
  if (/^\d/.test(street)) return null;

  const { streetType, words } = streetParts(street);
  if (words.length === 0) return null;

  return {
    houseNumber: normalizeHouseNumber(`${digits}${match?.[2] ?? ''}`),
    streetType,
    words,
  };
}

// why: the geocoder score cannot gate this. Measured 2026-09-24, it returned
// "19 Rue de la Poterie" for "19 rue du Champs de la Vigne" at 0.51 and the
// right door behind a building name at 0.37. So the answer is checked word by
// word: same house number, same commune, same street type when the raw line
// names one, and every significant word of the raw street present in the
// answer. The register may name a street more fully ("Rue Etienne Richerand"
// for "rue Richerand"), never differently.
export function verifyGeocodedAddress(input: {
  raw: RawStreetLine;
  geocoded: GeocodedAddress;
  inseeCode: string;
}): boolean {
  const { raw, geocoded } = input;
  if (geocoded.kind !== 'housenumber') return false;
  if (geocoded.inseeCode !== input.inseeCode) return false;
  if (geocoded.houseNumber === null || geocoded.street === null) return false;
  if (normalizeHouseNumber(geocoded.houseNumber) !== raw.houseNumber) {
    return false;
  }

  const answer = streetParts(geocoded.street);
  if (raw.streetType !== null && raw.streetType !== answer.streetType) {
    return false;
  }
  return raw.words.every((word) => answer.words.includes(word));
}
