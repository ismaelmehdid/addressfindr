import type { AddressCandidate, DpeRecord } from './types';

const STREET_ABBREVIATIONS: Record<string, string> = {
  av: 'avenue',
  ave: 'avenue',
  bd: 'boulevard',
  bld: 'boulevard',
  blvd: 'boulevard',
  bvd: 'boulevard',
  pl: 'place',
  imp: 'impasse',
  all: 'allee',
  sq: 'square',
  rte: 'route',
  ch: 'chemin',
  che: 'chemin',
  cours: 'cours',
  st: 'saint',
  ste: 'sainte',
  sts: 'saints',
};

export function normalizeAddressForComparison(raw: string): string {
  const flattened = raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return flattened
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => STREET_ABBREVIATIONS[word] ?? word)
    .join(' ');
}

// why: le libelle d'adresse varie en typographie et porte parfois du double
// encodage, alors que identifiant_ban est stable et renseigne sur 34045 lignes
// sur 34045 mesurees. Prefixer evite qu'un identifiant ne collisionne avec un
// libelle normalise qui lui ressemblerait.
export function addressGroupKey(record: DpeRecord): string {
  if (record.banId) {
    return `ban:${record.banId}`;
  }
  return `txt:${normalizeAddressForComparison(record.address)}`;
}

// why: le libelle ADEME s'arrete a la commune ("69003 Lyon") la ou un portail
// peut ecrire l'arrondissement en toutes lettres. Comparer par prefixe evite de
// rater une egalite pour un suffixe administratif.
function addressesMatch(left: string, right: string): boolean {
  const a = normalizeAddressForComparison(left);
  const b = normalizeAddressForComparison(right);
  if (a.length === 0 || b.length === 0) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

export function rankOfTrueAddress(input: {
  candidates: readonly AddressCandidate[];
  trueAddress: string;
}): { rank: number | null; total: number } {
  const total = input.candidates.length;
  const index = input.candidates.findIndex((candidate) =>
    addressesMatch(candidate.record.address, input.trueAddress),
  );
  return { rank: index === -1 ? null : index + 1, total };
}

// why: la verite terrain gratuite du projet est au niveau rue, pas adresse.
// Mesure du 2026-09-22 sur 6 annonces pap.fr : le streetAddress publie en
// JSON-LD vaut "Rue Tholoze 75018 Paris" ou "Rue Brancion" — le portail donne
// la voie et retient le numero, ce qui est precisement ce que le produit
// cherche. La bonne rue reste donc la seule chose mesurable a peu de frais.
const LEADING_HOUSE_NUMBER = /^\d+\s*(bis|ter|quater)?\s+/;
const TRAILING_POSTAL_SUFFIX = /\s\d{5}(\s.*)?$/;

export function streetOfAddress(raw: string): string {
  const withoutSuffix = raw.replace(TRAILING_POSTAL_SUFFIX, '');
  const normalized = normalizeAddressForComparison(withoutSuffix);
  return normalized.replace(LEADING_HOUSE_NUMBER, '').trim();
}

export function rankOfTrueStreet(input: {
  candidates: readonly AddressCandidate[];
  trueAddress: string;
}): { rank: number | null; total: number } {
  const wanted = streetOfAddress(input.trueAddress);
  const total = input.candidates.length;
  if (wanted.length === 0) return { rank: null, total };

  const index = input.candidates.findIndex(
    (candidate) => streetOfAddress(candidate.record.address) === wanted,
  );
  return { rank: index === -1 ? null : index + 1, total };
}
