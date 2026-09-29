import type { GeoPoint } from '@/core/geo/types';
import type { ExtractedValues } from '@/core/listing/types';
import { addressGroupKey } from './address-identity';
import { scoreFromConfidence } from './score-scale';
import {
  type AddressCandidate,
  type AddressMatch,
  type DpeRecord,
  FIRST_REGISTERED_DPE_DATE,
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
  signal: DirectSignal,
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
    // why: the search already bounds the surface at 12 %, so a residual gap
    // is weak agreement, not divergence. It earns less as it grows and never
    // less than nothing: the row the cost and the date designate can sit 11 %
    // away (annexes counted by the listing).
    const ratio = delta / listed;
    return ratio <= 0.01
      ? { award: 2, weight: 2 }
      : ratio <= 0.03
        ? { award: 1.5, weight: 2 }
        : ratio <= 0.06
          ? { award: 1, weight: 2 }
          : { award: 0.5, weight: 2 };
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
  // why: un terrain annonce et une contenance cadastrale ne coincident jamais
  // au metre — l'annonce arrondit, la parcelle inclut les acces. Une fenetre
  // large credite, un ecart franc penalise.
  if (signal === 'landSurfaceM2') {
    const ratio = delta / Math.max(listed, found);
    return ratio <= 0.05
      ? { award: 3, weight: 3 }
      : ratio <= 0.15
        ? { award: 2, weight: 3 }
        : { award: -2, weight: 3 };
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
  'annualEnergyCost',
  'dpeDate',
  'pinDistance',
  'gesClass',
  'dpeKwhM2Year',
  'gesKgCo2M2Year',
  'heatingEnergy',
  'yearBuilt',
  'buildingFloors',
  'landSurfaceM2',
  'floor',
];

type DirectSignal = Exclude<
  MatchSignal,
  'annualEnergyCost' | 'dpeDate' | 'pinDistance'
>;

// why: the listing's map pin travels beside the extracted values, never
// inside them — it is portal metadata, not a value read on the page.
type MatchValues = ExtractedValues & { pin?: GeoPoint | null };

const DIRECT_SIGNALS: readonly DirectSignal[] = [
  'surfaceM2',
  'dpeClass',
  'gesClass',
  'dpeKwhM2Year',
  'gesKgCo2M2Year',
  'heatingEnergy',
  'yearBuilt',
  'buildingFloors',
  'landSurfaceM2',
  'floor',
];

// why: the label prints a range rounded to ten euros around the cost ADEME
// publishes. Measured 2026-09-24 on four rows precisement.fr designates: the
// midpoint lands within 0.5 % of the cost. On a small dwelling the rounding of
// both bounds outweighs the percentage, hence the floor in euros.
const ENERGY_COST_TOLERANCE_RATIO = 0.015;
const ENERGY_COST_TOLERANCE_MIN_EUR = 15;

function gradeEnergyCost(
  values: ExtractedValues,
  record: DpeRecord,
): SignalVerdict | null {
  const min = values.annualEnergyCostMinEur;
  const max = values.annualEnergyCostMaxEur;
  const found = record.annualEnergyCostEur;
  if (min === null || max === null || found === null) return null;
  const unit = Math.max(
    found * ENERGY_COST_TOLERANCE_RATIO,
    ENERGY_COST_TOLERANCE_MIN_EUR,
  );
  return gradeNumber(
    Math.abs((min + max) / 2 - found),
    [
      [unit, 4],
      [unit * 2, 3],
      [unit * 4, 1],
    ],
    -3,
    4,
  );
}

// why: the listing quotes the date the diagnostic was carried out, which
// ADEME publishes in two fields — the visit and the establishment, sometimes a
// day apart. Another date designates another DPE: another dwelling, or a
// diagnostic redone.
const DPE_DATE_NEAR_DAYS = 3;
const MS_PER_DAY = 86_400_000;

function gradeDpeDate(
  values: ExtractedValues,
  record: DpeRecord,
): SignalVerdict | null {
  const listed = values.dpeDate;
  const found = [record.establishedOn, record.visitedOn].filter(
    (date): date is string => date !== null,
  );
  if (listed === null || found.length === 0) return null;
  if (listed < FIRST_REGISTERED_DPE_DATE) return null;
  if (found.includes(listed)) return { award: 4, weight: 4 };
  const listedAt = Date.parse(listed);
  const nearest = Math.min(
    ...found.map((date) => Math.abs(Date.parse(date) - listedAt) / MS_PER_DAY),
  );
  return nearest <= DPE_DATE_NEAR_DAYS
    ? { award: 2, weight: 4 }
    : { award: -3, weight: 4 };
}

const EARTH_RADIUS_M = 6_371_000;

function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// why: measured 2026-09-24 on leboncoin pins placed from a typed address: the
// row precisement.fr designates sat 3 m, 13 m, 94 m and 393 m away, and 1 km
// on a listing they flag as ambiguous. Close credits strongly; far only
// doubts, since a seller can pin the street corner rather than the door.
function gradePin(
  values: MatchValues,
  record: DpeRecord,
): SignalVerdict | null {
  if (!values.pin || record.point === null) return null;
  return gradeNumber(
    metresBetween(values.pin, record.point),
    [
      [60, 3],
      [150, 2],
      [400, 1],
    ],
    -1,
    3,
  );
}

function verdictsFor(
  values: MatchValues,
  record: DpeRecord,
): [MatchSignal, SignalVerdict][] {
  const verdicts: [MatchSignal, SignalVerdict][] = [];
  for (const signal of DIRECT_SIGNALS) {
    const listed = values[signal];
    const found = record[signal];
    if (listed === null || found === null) continue;
    if (!isComparable(signal, record)) continue;
    const verdict = gradeSignal(signal, listed, found);
    if (verdict !== null) verdicts.push([signal, verdict]);
  }
  const cost = gradeEnergyCost(values, record);
  if (cost !== null) verdicts.push(['annualEnergyCost', cost]);
  const date = gradeDpeDate(values, record);
  if (date !== null) verdicts.push(['dpeDate', date]);
  const pin = gradePin(values, record);
  if (pin !== null) verdicts.push(['pinDistance', pin]);
  return verdicts;
}

// why: the score is the share of compared evidence that agrees. On the
// surface and both letters alone — 6 points of weight — full agreement read
// 100 %, while hundreds of rows share those three values. Measured 2026-09-24:
// 17 leboncoin listings out of 25 returned a wrong address at 100 % this way.
// The denominator never drops below this floor: approaching 100 takes a
// numeric or dated value.
const EVIDENCE_FLOOR_WEIGHT = 12;

// why: numero_etage_appartement vaut 0 sur 85 des 89 lignes renseignees du
// releve du 2026-09-22. C'est une valeur par defaut, pas un rez-de-chaussee.
// La comparer ecarterait la bonne ligne sur une donnee que l'ADEME n'a pas.
// why: un appartement n'a pas de terrain — la parcelle porte tout l'immeuble,
// donc la comparer a ce qu'annonce un lot serait une erreur garantie.
function isComparable(signal: DirectSignal, record: DpeRecord): boolean {
  if (signal === 'landSurfaceM2') return record.propertyType === 'house';
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
  values: MatchValues;
  record: DpeRecord;
}): AddressCandidate {
  const matched: MatchSignal[] = [];
  const diverged: MatchSignal[] = [];
  let awarded = 0;
  let available = 0;

  for (const [signal, verdict] of verdictsFor(input.values, input.record)) {
    awarded += verdict.award;
    available += verdict.weight;
    // why: l'etiquette suit le signe du score. Un signal credite ne peut pas
    // s'afficher comme divergent, sinon l'interface contredit le classement.
    if (verdict.award > 0) matched.push(signal);
    else diverged.push(signal);
  }

  const agreement =
    available === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, awarded / Math.max(available, EVIDENCE_FLOOR_WEIGHT)),
        );
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

function carriesEvidence(candidate: AddressCandidate): boolean {
  return [...candidate.matched, ...candidate.diverged].some((signal) =>
    DISCRIMINATING_SIGNALS.includes(signal),
  );
}

function showsAboveZero(candidate: AddressCandidate): boolean {
  return scoreFromConfidence(candidate.confidence) > 0;
}

function supports(candidate: AddressCandidate): boolean {
  return candidate.diverged.length === 0 && candidate.matched.length > 0;
}

// why: le classement sert deux fois — une premiere passe pour savoir quelles
// adresses valent un aller-retour vers la BDNB, une seconde sur les lignes
// enrichies. Meme ordre dans les deux cas, donc meme fonction.
function rankAll(
  values: MatchValues,
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

export function carriesDpeDate(record: DpeRecord, dpeDate: string): boolean {
  return record.establishedOn === dpeDate || record.visitedOn === dpeDate;
}

const LABEL_NUMBERS: readonly MatchSignal[] = [
  'annualEnergyCost',
  'dpeKwhM2Year',
  'gesKgCo2M2Year',
];

// why: a row from outside the stated commune lacks the commune's implicit
// support, and a wrong address costs more than none. It is admitted only on
// the exact DPE date plus a number printed on the label, with nothing
// contradicting the listing.
export function admitsOutsideCommune(input: {
  values: MatchValues;
  record: DpeRecord;
}): boolean {
  const { dpeDate } = input.values;
  const sameDay = dpeDate !== null && carriesDpeDate(input.record, dpeDate);
  const scored = scoreCandidate(input);
  return (
    sameDay &&
    scored.diverged.length === 0 &&
    scored.matched.some((signal) => LABEL_NUMBERS.includes(signal))
  );
}

export function rankedBanIds(input: {
  values: MatchValues;
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
  values: MatchValues;
  records: readonly DpeRecord[];
  truncated: boolean;
}): AddressMatch {
  const candidates = rankAll(input.values, input.records);

  // why: the gate used to be decided on the whole population, so one row
  // carrying evidence let a shortlist of rows that only agreed on the search
  // filters through. A row whose only agreement is the surface and the DPE
  // letter says nothing about this dwelling, so it is never returned at all.
  const withEvidence = candidates.filter(carriesEvidence);
  // why: a candidate shown as 0/100 is one the evidence contradicts at least
  // as much as it supports. It is dropped before the cut, on the display's own
  // rounding, so it never takes a slot; rows that all read 0 are no match,
  // not a lack of evidence.
  const shortlist = withEvidence
    .filter(showsAboveZero)
    .slice(0, MAX_CANDIDATES_RETURNED);
  const refusedFor: MatchRefusal | null =
    candidates.length > 0 && withEvidence.length === 0
      ? 'insufficient-evidence'
      : null;

  return {
    candidates: refusedFor === null ? shortlist : [],
    inspected: input.records.length,
    truncated: input.truncated,
    refusedFor,
  };
}
