export const SNIPPET_CHAR_BUDGET_DEFAULT = 12_000;
export const TEXT_CHAR_BUDGET_DEFAULT = 12_000;

export type TruncatedSnippets<T> = {
  readonly items: ReadonlyArray<T>;
  readonly droppedCount: number;
  readonly truncated: boolean;
};

export function truncateSnippetsByCharBudget<T extends { content: string }>(
  snippets: ReadonlyArray<T>,
  maxTotalChars: number = SNIPPET_CHAR_BUDGET_DEFAULT,
): TruncatedSnippets<T> {
  const out: T[] = [];
  let used = 0;
  for (const s of snippets) {
    if (used + s.content.length > maxTotalChars && out.length > 0) break;
    out.push(s);
    used += s.content.length;
  }
  return {
    items: out,
    droppedCount: snippets.length - out.length,
    truncated: out.length < snippets.length,
  };
}

const TRUNCATION_NOTE = '\n\n[content truncated to fit context budget]';

export function truncateTextByCharBudget(
  text: string,
  maxChars: number = TEXT_CHAR_BUDGET_DEFAULT,
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: text.slice(0, maxChars) + TRUNCATION_NOTE,
    truncated: true,
  };
}
