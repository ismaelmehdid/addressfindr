import type { ExtractedValues } from '@/core/listing/types';
import { addressGroupKey } from './address-identity';
import {
  type AddressCandidate,
  type AddressMatch,
  type DpeRecord,
  MAX_CANDIDATES_RETURNED,
  type MatchRefusal,
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
  // why: le nombre d'etages de l'immeuble se lit souvent dans l'annonce et la
  // BDNB le donne sur les adresses qu'elle rattache. Un ecart d'un niveau est
  // courant — rez-de-chaussee compte ou non — donc il reste credite.
  if (signal === 'buildingFloors') {
    return gradeNumber(
      delta,
      [
        [0, 2],
        [1, 1],
      ],
      -1,
      2,
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

// why: un signal deja pose en filtre dur de la recherche ne discrimine rien —
// toute ligne qui revient s'accorde dessus par construction. C'est le cas de la
// surface ET de la lettre DPE : buildDpeSearch les met toutes deux dans le
// filtre, et l'adaptateur en fait `surface_habitable_logement:[a TO b]` et
// `etiquette_dpe:"D"`. La lettre est meme le pire des deux : la surface est un
// intervalle, donc les lignes en different et le signal separe un peu ; la
// lettre est une egalite exacte, donc elle ne separe jamais.
// La lettre GES, elle, n'est jamais filtree : elle discrimine vraiment.
// Mesure du 2026-09-22 : sans cette liste, une annonce pap.fr sans DPE sortait
// dix adresses a 100% que rien ne separait.
const DISCRIMINATING_SIGNALS: readonly MatchSignal[] = [
  'gesClass',
  'dpeKwhM2Year',
  'gesKgCo2M2Year',
  'heatingEnergy',
  'yearBuilt',
  'buildingFloors',
  'floor',
];

const SIGNALS: readonly MatchSignal[] = [
  'surfaceM2',
  'dpeClass',
  'gesClass',
  'dpeKwhM2Year',
  'gesKgCo2M2Year',
  'heatingEnergy',
  'yearBuilt',
  'buildingFloors',
  'floor',
];

// why: numero_etage_appartement vaut 0 sur 85 des 89 lignes renseignees du
// releve du 2026-09-22. C'est une valeur par defaut, pas un rez-de-chaussee.
// La comparer ecarterait la bonne ligne sur une donnee que l'ADEME n'a pas.
function isComparable(signal: MatchSignal, record: DpeRecord): boolean {
  return signal !== 'floor' || (record.floor !== null && record.floor !== 0);
}

// why: score_ban dit a quel point l'ADEME est sure d'avoir rattache la ligne a
// cette adresse. Une ligne peut coller parfaitement au logement et pointer la
// mauvaise porte — c'est l'erreur la plus couteuse du produit. Mesure du
// 2026-09-22 a Lyon 3e : 372 lignes sur 34045 sont sous 0.5, donc la
// penalite ne mord que sur une minorite et ne descend jamais plus bas que la
// moitie, faute de quoi une adresse vraie mais mal geocodee sortirait du
// classement au lieu d'y figurer avec une reserve.
const GEOCODING_DOUBT_BELOW = 0.5;
const GEOCODING_WORST_FACTOR = 0.6;

function geocodingFactor(score: number | null): number {
  if (score === null || score >= GEOCODING_DOUBT_BELOW) return 1;
  const clamped = Math.max(0, score);
  const shortfall = (GEOCODING_DOUBT_BELOW - clamped) / GEOCODING_DOUBT_BELOW;
  return 1 - shortfall * (1 - GEOCODING_WORST_FACTOR);
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

  const agreement =
    available === 0 ? 0 : Math.min(1, Math.max(0, awarded / available));
  const confidence = agreement * geocodingFactor(input.record.geocodingScore);

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
      groups.set(key, {
        ...candidate,
        supportingRecords: supports(candidate) ? 1 : 0,
      });
      continue;
    }
    const face =
      candidate.confidence > current.confidence ? candidate : current;
    // why: un appui est une ligne qui confirme l'annonce, pas une ligne qui la
    // contredit. Les compter toutes faisait remonter une adresse au rang 1
    // grace aux lignes qui la refutaient.
    groups.set(key, {
      ...face,
      supportingRecords:
        current.supportingRecords + (supports(candidate) ? 1 : 0),
    });
  }

  return [...groups.values()];
}

function hasDiscriminatingEvidence(
  candidates: readonly AddressCandidate[],
): boolean {
  return candidates.some((candidate) =>
    [...candidate.matched, ...candidate.diverged].some((signal) =>
      DISCRIMINATING_SIGNALS.includes(signal),
    ),
  );
}

function supports(candidate: AddressCandidate): boolean {
  return candidate.diverged.length === 0 && candidate.matched.length > 0;
}

// why: le classement sert deux fois — une premiere passe pour savoir quelles
// adresses valent un aller-retour vers la BDNB, une seconde sur les lignes
// enrichies. Meme ordre dans les deux cas, donc meme fonction.
function rankAll(
  values: ExtractedValues,
  records: readonly DpeRecord[],
): AddressCandidate[] {
  const scored = records.map((record) => scoreCandidate({ values, record }));

  // why: le nombre de lignes d'appui n'est pas calibre contre une verite
  // terrain, donc il departage seulement. Il ne remonte jamais une adresse
  // moins bien notee au-dessus d'une mieux notee.
  return groupByAddress(scored).sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (b.supportingRecords !== a.supportingRecords) {
      return b.supportingRecords - a.supportingRecords;
    }
    const scoreGap =
      (b.record.geocodingScore ?? 0) - (a.record.geocodingScore ?? 0);
    if (scoreGap !== 0) return scoreGap;
    return a.record.dpeNumber.localeCompare(b.record.dpeNumber);
  });
}

export function rankedBanIds(input: {
  values: ExtractedValues;
  records: readonly DpeRecord[];
  limit: number;
}): string[] {
  const seen: string[] = [];
  for (const candidate of rankAll(input.values, input.records)) {
    const banId = candidate.record.banId;
    if (banId === null || seen.includes(banId)) continue;
    seen.push(banId);
    if (seen.length >= input.limit) break;
  }
  return seen;
}

export function rankCandidates(input: {
  values: ExtractedValues;
  records: readonly DpeRecord[];
  truncated: boolean;
}): AddressMatch {
  const candidates = rankAll(input.values, input.records);

  // why: la porte se decidait sur toute la population avant la coupe. Une
  // seule ligne enfouie loin dans le classement debloquait donc une liste
  // entiere dont aucune entree ne portait la moindre preuve. Elle se decide
  // desormais sur la liste reellement rendue.
  const shortlist = candidates.slice(0, MAX_CANDIDATES_RETURNED);
  const refusedFor: MatchRefusal | null =
    shortlist.length > 0 && !hasDiscriminatingEvidence(shortlist)
      ? 'insufficient-evidence'
      : null;

  return {
    candidates: refusedFor === null ? shortlist : [],
    inspected: input.records.length,
    truncated: input.truncated,
    refusedFor,
  };
}
