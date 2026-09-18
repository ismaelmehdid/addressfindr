'use client';

import type { UIMessage } from 'ai';
import { useEffect, useMemo, useState } from 'react';
import {
  type ActiveContextRef,
  toolActiveContext,
} from '@/core/chat/active-context';

function partToolName(type: string, part: Record<string, unknown>): string {
  if (type === 'dynamic-tool') {
    return typeof part.toolName === 'string' ? part.toolName : 'tool';
  }
  return type.slice('tool-'.length);
}

export function useActiveContext(
  messages: UIMessage[],
): ActiveContextRef | null {
  return useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const parts = messages[i]?.parts ?? [];
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j] as Record<string, unknown> & { type: string };
        const type = part.type;
        if (!type.startsWith('tool-') && type !== 'dynamic-tool') continue;
        if (!('input' in part)) continue;
        const ref = toolActiveContext(partToolName(type, part), part.input);
        if (ref) return ref;
      }
    }
    return null;
  }, [messages]);
}

export function useContextName(ref: ActiveContextRef | null): string | null {
  const [names, setNames] = useState<Record<string, string>>({});
  const kind = ref?.kind ?? null;
  const id = ref?.id ?? null;
  const key = kind && id ? `${kind}:${id}` : null;

  useEffect(() => {
    if (!kind || !id || !key || names[key] !== undefined) return;
    let cancelled = false;
    void (async (): Promise<void> => {
      const params = new URLSearchParams({ kind, id });
      const res = await fetch(`/api/chat/active-context?${params.toString()}`);
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as { name?: unknown };
      if (cancelled || typeof json.name !== 'string') return;
      const resolved = json.name;
      setNames((prev) => ({ ...prev, [key]: resolved }));
    })();
    return (): void => {
      cancelled = true;
    };
  }, [kind, id, key, names]);

  return key ? (names[key] ?? null) : null;
}
