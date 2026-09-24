import type { AddressCandidate } from './types';

// why: la carte parle pour la premiere adresse du classement. Si celle-ci n'a
// pas de point fiable, epingler la suivante afficherait une autre adresse que
// la reponse ; seul un choix explicite de l'utilisateur deplace l'epingle.
export function candidateOnMap(
  candidates: readonly AddressCandidate[],
  chosenDpeNumber: string | null,
): AddressCandidate | null {
  const chosen = candidates.find(
    (candidate) =>
      candidate.record.dpeNumber === chosenDpeNumber &&
      candidate.record.point !== null,
  );
  return chosen ?? candidates[0] ?? null;
}
