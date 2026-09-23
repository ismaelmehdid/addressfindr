import type { ExtractedValues } from '@/core/listing/types';
import { addressGroupKey } from './address-identity';
import {
  type AddressCandidate,
  type AddressMatch,
  type DpeRecord,
  MAX_CANDIDATES_RETURNED,
  type MatchSignal,
} from './types';

type SignalVerdict = { award: number; weight: number };

function gradeNumber(
  delta: number,
  steps: readonly [number, number][],
  fallback: number,
  weight: number,
): SignalVerdict {
  for (const [limit, award] of steps) {
    if (delta <= limit) return { award, weight };
  }
  return { award: fallback, weight };
}

function gradeSignal(
  signal: MatchSignal,
  listed: number | string,
  found: number | string,
): SignalVerdict | null {
  // why: mesure du 2026-09-22, type_energie_principale_chauffage est renseigne
  // sur 34045 lignes sur 34045 et decoupe un lot en trois (gaz 334,
  // electricite 218, urbain 45). Comme pour une lettre, un desaccord est net :
  // ce n'est pas une valeur qui glisse d'un cran.
  if (
    signal === 'dpeClass' ||
    signal === 'gesClass' ||
    signal === 'heatingEnergy'
  ) {
    return listed === found
      ? { award: 2, weight: 2 }
      : { award: -2, weight: 2 };
  }

  if (typeof listed !== 'number' || typeof found !== 'number') return null;
  const delta = Math.abs(listed - found);

  if (signal === 'surfaceM2') {
    // why: la recherche a deja borne la surface, donc un ecart residuel est un
    // accord faible et non une divergence. Il rapporte moins, jamais moins que
    // rien : sinon l'etiquette affichee contredirait le score.
    return gradeNumber(
      delta,
      [
        [0.5, 2],
        [1.5, 1.5],
      ],
      1,
      2,
    );
  }
  if (signal === 'dpeKwhM2Year') {
    return gradeNumber(
      delta,
      [
        [2, 4],
        [5, 3],
        [10, 1.5],
      ],
      -2,
      4,
    );
  }
  if (signal === 'gesKgCo2M2Year') {
    return gradeNumber(
      delta,
      [
        [1, 3],
        [3, 2],
        [6, 1],
      ],
      -1.5,
      3,
    );
  }
  if (signal === 'yearBuilt') {
    return gradeNumber(
      delta,
      [
        [1, 2],
        [5, 1],
      ],
      -1,
      2,
    );
  }
  return delta === 0 ? { award: 1.5, weight: 1.5 } : { award: -1, weight: 1.5 };
}

const SIGNALS: readonly MatchSignal[] = [
  'surfaceM2',
  'dpeClass',
  'gesClass',
  'dpeKwhM2Year',
  'gesKgCo2M2Year',
  'heatingEnergy',
  'yearBuilt',
  'floor',
];

// why: numero_etage_appartement vaut 0 sur 85 des 89 lignes renseignees du
// releve du 2026-09-22. C'est une valeur par defaut, pas un rez-de-chaussee.
// La comparer ecarterait la bonne ligne sur une donnee que l'ADEME n'a pas.
function isComparable(signal: MatchSignal, record: DpeRecord): boolean {
  return signal !== 'floor' || (record.floor !== null && record.floor !== 0);
}

export function scoreCandidate(input: {
  values: ExtractedValues;
  record: DpeRecord;
}): AddressCandidate {
  const matched: MatchSignal[] = [];
  const diverged: MatchSignal[] = [];
  let awarded = 0;
  let available = 0;

  for (const signal of SIGNALS) {
    const listed = input.values[signal];
    const found = input.record[signal];
    if (listed === null || found === null) continue;
    if (!isComparable(signal, input.record)) continue;

    const verdict = gradeSignal(signal, listed, found);
    if (verdict === null) continue;

    awarded += verdict.award;
    available += verdict.weight;
    // why: l'etiquette suit le signe du score. Un signal credite ne peut pas
    // s'afficher comme divergent, sinon l'interface contredit le classement.
    if (verdict.award > 0) matched.push(signal);
    else diverged.push(signal);
  }

  const confidence =
    available === 0 ? 0 : Math.min(1, Math.max(0, awarded / available));

  return {
    record: input.record,
    confidence,
    matched,
    diverged,
    supportingRecords: 1,
  };
}

// why: le produit rend une adresse, pas une ligne DPE. Mesure du 2026-09-22 :
// 600 lignes Lyon 3e ne portent que 372 adresses distinctes, une adresse
// revenant 15 fois. Sans regroupement, une liste de dix peut n'etre que trois
// immeubles, et un immeuble uniforme — l'indice le plus fort — se lit comme
// quinze reponses concurrentes.
function groupByAddress(
  scored: readonly AddressCandidate[],
): AddressCandidate[] {
  const groups = new Map<string, AddressCandidate>();

  for (const candidate of scored) {
    const key = addressGroupKey(candidate.record);
    const current = groups.get(key);
    if (current === undefined) {
      groups.set(key, { ...candidate, supportingRecords: 1 });
      continue;
    }
    const face =
      candidate.confidence > current.confidence ? candidate : current;
    groups.set(key, {
      ...face,
      supportingRecords: current.supportingRecords + 1,
    });
  }

  return [...groups.values()];
}

export function rankCandidates(input: {
  values: ExtractedValues;
  records: readonly DpeRecord[];
  truncated: boolean;
}): AddressMatch {
  const scored = input.records.map((record) =>
    scoreCandidate({ values: input.values, record }),
  );

  // why: le nombre de lignes d'appui n'est pas calibre contre une verite
  // terrain, donc il departage seulement. Il ne remonte jamais une adresse
  // moins bien notee au-dessus d'une mieux notee.
  const candidates = groupByAddress(scored).sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (b.supportingRecords !== a.supportingRecords) {
      return b.supportingRecords - a.supportingRecords;
    }
    const scoreGap =
      (b.record.geocodingScore ?? 0) - (a.record.geocodingScore ?? 0);
    if (scoreGap !== 0) return scoreGap;
    return a.record.dpeNumber.localeCompare(b.record.dpeNumber);
  });

  return {
    candidates: candidates.slice(0, MAX_CANDIDATES_RETURNED),
    inspected: input.records.length,
    truncated: input.truncated,
  };
}
