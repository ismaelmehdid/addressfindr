import { describe, expect, it } from 'vitest';
import {
  applyScoreCutoff,
  dedupSnippets,
  defaultSnippetDedupKey,
  postprocessSnippets,
} from './snippet-postprocess';
import type { ZeroEntropySnippet } from './types';

function snip(args: {
  path: string;
  score: number;
  pageSpan?: [number, number] | null;
  content?: string;
}): ZeroEntropySnippet {
  return {
    path: args.path,
    score: args.score,
    pageSpan: args.pageSpan ?? null,
    content: args.content ?? 'c',
    documentMetadata: {},
  };
}

describe('defaultSnippetDedupKey', () => {
  it('keys by path and pageSpan', () => {
    expect(
      defaultSnippetDedupKey(snip({ path: 'a', score: 1, pageSpan: [1, 2] })),
    ).toBe('a::1:2');
  });

  it('uses "null" placeholder when pageSpan absent', () => {
    expect(defaultSnippetDedupKey(snip({ path: 'a', score: 1 }))).toBe(
      'a::null',
    );
  });
});

describe('applyScoreCutoff', () => {
  it('keeps snippets at or above min score', () => {
    const out = applyScoreCutoff(
      [
        snip({ path: 'a', score: 0.2 }),
        snip({ path: 'b', score: 0.5 }),
        snip({ path: 'c', score: 0.9 }),
      ],
      0.5,
    );
    expect(out.map((s) => s.path)).toEqual(['b', 'c']);
  });

  it('returns empty when nothing meets the cutoff', () => {
    expect(applyScoreCutoff([snip({ path: 'a', score: 0.1 })], 0.5)).toEqual(
      [],
    );
  });
});

describe('dedupSnippets', () => {
  it('keeps the highest-scoring snippet per dedup key', () => {
    const out = dedupSnippets([
      snip({ path: 'a', score: 0.4, pageSpan: [1, 1] }),
      snip({ path: 'a', score: 0.9, pageSpan: [1, 1] }),
      snip({ path: 'b', score: 0.5 }),
    ]);
    expect(out.map((s) => ({ path: s.path, score: s.score }))).toEqual([
      { path: 'a', score: 0.9 },
      { path: 'b', score: 0.5 },
    ]);
  });

  it('sorts results by score desc', () => {
    const out = dedupSnippets([
      snip({ path: 'a', score: 0.1 }),
      snip({ path: 'b', score: 0.9 }),
      snip({ path: 'c', score: 0.5 }),
    ]);
    expect(out.map((s) => s.score)).toEqual([0.9, 0.5, 0.1]);
  });

  it('treats different pageSpan as distinct entries even for same path', () => {
    const out = dedupSnippets([
      snip({ path: 'a', score: 0.5, pageSpan: [1, 1] }),
      snip({ path: 'a', score: 0.7, pageSpan: [2, 2] }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('honours custom dedupKey', () => {
    const out = dedupSnippets(
      [snip({ path: 'a', score: 0.1 }), snip({ path: 'b', score: 0.9 })],
      () => 'same',
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.score).toBe(0.9);
  });
});

describe('postprocessSnippets', () => {
  it('cuts off then dedups', () => {
    const out = postprocessSnippets({
      snippets: [
        snip({ path: 'a', score: 0.1 }),
        snip({ path: 'a', score: 0.5 }),
        snip({ path: 'b', score: 0.8 }),
      ],
      minScore: 0.4,
    });
    expect(out.map((s) => s.path)).toEqual(['b', 'a']);
  });
});
