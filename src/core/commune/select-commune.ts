import {
  type Commune,
  type CommuneResolution,
  MAX_AMBIGUOUS_CANDIDATES,
} from './types';

export function normalizeCommuneName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[-'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// why: la base ADEME est clef'ee sur l'arrondissement, pas sur la commune mere.
// Mesure du 2026-09-22 : 36 709 lignes sous 69383 (Lyon 3e) contre 61 sous
// 69123 (Lyon), 94 389 sous 75115 contre 419 sous 75056. Retenir la commune
// mere ferait perdre plus de 99% des lignes.
export function selectCommune(input: {
  candidates: readonly Commune[];
  city: string | null;
}): CommuneResolution {
  const { candidates } = input;
  if (candidates.length === 0) return { kind: 'unresolved' };

  const arrondissements = candidates.filter((c) => c.isArrondissement);
  if (arrondissements.length === 1 && arrondissements[0]) {
    return { kind: 'resolved', commune: arrondissements[0] };
  }

  const pool = arrondissements.length > 0 ? arrondissements : candidates;
  if (pool.length === 1 && pool[0]) {
    return { kind: 'resolved', commune: pool[0] };
  }

  if (input.city !== null) {
    const wanted = normalizeCommuneName(input.city);
    const named = pool.filter((c) => normalizeCommuneName(c.name) === wanted);
    if (named.length === 1 && named[0]) {
      return { kind: 'resolved', commune: named[0] };
    }
  }

  return {
    kind: 'ambiguous',
    candidates: pool.slice(0, MAX_AMBIGUOUS_CANDIDATES),
  };
}
