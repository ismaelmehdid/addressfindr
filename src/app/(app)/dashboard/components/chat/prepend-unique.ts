import type { UIMessage } from 'ai';

export function prependUnique(
  prev: UIMessage[],
  incoming: UIMessage[],
): UIMessage[] {
  if (incoming.length === 0) return prev;
  const existingIds = new Set(prev.map((m) => m.id));
  const filtered = incoming.filter((m) => !existingIds.has(m.id));
  if (filtered.length === 0) return prev;
  return [...filtered, ...prev];
}
