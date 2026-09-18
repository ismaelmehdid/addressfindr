import type { ZeroEntropySnippet } from './types';

export type SnippetDedupKey = (snippet: ZeroEntropySnippet) => string;

export const defaultSnippetDedupKey: SnippetDedupKey = (s) => {
  const span = s.pageSpan ? `${s.pageSpan[0]}:${s.pageSpan[1]}` : 'null';
  return `${s.path}::${span}`;
};

export function applyScoreCutoff(
  snippets: ZeroEntropySnippet[],
  minScore: number,
): ZeroEntropySnippet[] {
  return snippets.filter((s) => s.score >= minScore);
}

export function dedupSnippets(
  snippets: ZeroEntropySnippet[],
  keyFn: SnippetDedupKey = defaultSnippetDedupKey,
): ZeroEntropySnippet[] {
  const seen = new Map<string, ZeroEntropySnippet>();
  for (const s of snippets) {
    const key = keyFn(s);
    const prev = seen.get(key);
    if (!prev || s.score > prev.score) {
      seen.set(key, s);
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.score - a.score);
}

export function postprocessSnippets(args: {
  snippets: ZeroEntropySnippet[];
  minScore: number;
  dedupKey?: SnippetDedupKey;
}): ZeroEntropySnippet[] {
  const cut = applyScoreCutoff(args.snippets, args.minScore);
  return dedupSnippets(cut, args.dedupKey);
}
