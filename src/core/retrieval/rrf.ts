export type RrfItemKey = (item: unknown) => string;

const DEFAULT_RRF_K = 60;

export type FusedItem<T> = {
  readonly item: T;
  readonly rrfScore: number;
  readonly sourceLists: number;
};

export function reciprocalRankFusion<T>(args: {
  rankedLists: ReadonlyArray<ReadonlyArray<T>>;
  keyFn: (item: T) => string;
  k?: number;
}): ReadonlyArray<FusedItem<T>> {
  const k = args.k ?? DEFAULT_RRF_K;
  const scores = new Map<
    string,
    { item: T; rrfScore: number; sourceLists: number }
  >();

  for (const list of args.rankedLists) {
    for (let rank = 0; rank < list.length; rank += 1) {
      const item = list[rank];
      if (item === undefined) continue;
      const key = args.keyFn(item);
      const contribution = 1 / (k + rank + 1);
      const existing = scores.get(key);
      if (existing) {
        existing.rrfScore += contribution;
        existing.sourceLists += 1;
      } else {
        scores.set(key, { item, rrfScore: contribution, sourceLists: 1 });
      }
    }
  }

  return Array.from(scores.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}
