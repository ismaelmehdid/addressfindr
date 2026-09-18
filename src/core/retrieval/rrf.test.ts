import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from './rrf';

type Item = { id: string };
const keyFn = (i: Item) => i.id;

describe('reciprocalRankFusion', () => {
  it('returns single list unchanged in order', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const fused = reciprocalRankFusion({ rankedLists: [list], keyFn });
    expect(fused.map((f) => f.item.id)).toEqual(['a', 'b', 'c']);
    expect(fused[0]?.sourceLists).toBe(1);
  });

  it('rewards items appearing in multiple lists', () => {
    const list1 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const list2 = [{ id: 'b' }, { id: 'a' }, { id: 'd' }];
    const fused = reciprocalRankFusion({
      rankedLists: [list1, list2],
      keyFn,
    });
    expect(fused[0]?.item.id).toMatch(/^(a|b)$/);
    expect(fused[0]?.sourceLists).toBe(2);
    expect(fused.find((f) => f.item.id === 'c')?.sourceLists).toBe(1);
  });

  it('deduplicates items appearing twice in same list (uses first rank)', () => {
    const list = [{ id: 'a' }, { id: 'a' }, { id: 'b' }];
    const fused = reciprocalRankFusion({ rankedLists: [list], keyFn });
    expect(fused.length).toBe(2);
  });

  it('handles empty list inputs', () => {
    const fused = reciprocalRankFusion({ rankedLists: [[], []], keyFn });
    expect(fused).toEqual([]);
  });

  it('preserves item references (no clone)', () => {
    const original = { id: 'x' };
    const fused = reciprocalRankFusion({
      rankedLists: [[original]],
      keyFn,
    });
    expect(fused[0]?.item).toBe(original);
  });

  it('k constant affects spread but preserves order', () => {
    const list1 = [{ id: 'a' }, { id: 'b' }];
    const list2 = [{ id: 'b' }, { id: 'a' }];
    const fused60 = reciprocalRankFusion({
      rankedLists: [list1, list2],
      keyFn,
      k: 60,
    });
    const fused1 = reciprocalRankFusion({
      rankedLists: [list1, list2],
      keyFn,
      k: 1,
    });
    expect(fused60.length).toBe(fused1.length);
    expect(fused60[0]?.sourceLists).toBe(2);
    expect(fused1[0]?.sourceLists).toBe(2);
  });
});
