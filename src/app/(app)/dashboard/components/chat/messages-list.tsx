'use client';

import type { UIMessage } from 'ai';
import { Loader2Icon } from 'lucide-react';
import { MessageBubble } from './message-bubble';

type Props = {
  messages: UIMessage[];
  isStreaming: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
};

const IN_FLIGHT_TOOL_STATES = new Set([
  'input-streaming',
  'input-available',
  'approval-requested',
]);

function latestReasoningLine(messages: UIMessage[]): string | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;
  let text = '';
  for (const part of last.parts) {
    if (
      part !== null &&
      typeof part === 'object' &&
      (part as { type?: unknown }).type === 'reasoning' &&
      typeof (part as { text?: unknown }).text === 'string'
    ) {
      text = (part as { text: string }).text;
    }
  }
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? (lines[lines.length - 1] ?? null) : null;
}

function hasInFlightToolCall(messages: UIMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return false;
  for (const part of last.parts) {
    if (part === null || typeof part !== 'object') continue;
    const type = (part as { type?: unknown }).type;
    if (typeof type !== 'string') continue;
    if (!type.startsWith('tool-') && type !== 'dynamic-tool') continue;
    const state = (part as { state?: unknown }).state;
    if (typeof state === 'string' && IN_FLIGHT_TOOL_STATES.has(state)) {
      return true;
    }
  }
  return false;
}

function ThinkingDots() {
  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label="Loading"
      role="status"
    >
      <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
      <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
      <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
    </span>
  );
}

export function MessagesList({
  messages,
  isStreaming,
  hasMore,
  isFetchingMore,
}: Props) {
  const reasoningLine = isStreaming ? latestReasoningLine(messages) : null;
  const toolInFlight = isStreaming ? hasInFlightToolCall(messages) : false;
  const showDots = isStreaming && !reasoningLine && !toolInFlight;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 pt-4 pb-6">
      {hasMore && (
        <div className="flex items-center justify-center py-3">
          {isFetchingMore && (
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          )}
        </div>
      )}
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {reasoningLine && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3 shrink-0 animate-spin" />
          <span className="min-w-0 truncate">{reasoningLine}</span>
        </div>
      )}
      {showDots && (
        <div className="px-1 py-1">
          <ThinkingDots />
        </div>
      )}
    </div>
  );
}
