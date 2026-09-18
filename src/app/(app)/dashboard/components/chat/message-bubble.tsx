'use client';

import type { UIMessage } from 'ai';
import { Check, Copy, FileText, Loader2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { CHAT_PROVIDER_METADATA_KEY } from '@/application/chat/dto';
import { Button } from '@/components/ui/button';
import { isHelpElementId } from '@/core/help/element-ids';
import { triggerHelpHighlight } from '@/lib/help-highlight';
import { cn } from '@/lib/utils';
import { MarkdownContent } from './markdown-content';
import {
  isInternalTool,
  ToolCallChip,
  type ToolCallState,
} from './tool-call-chip';

type RenderablePart =
  | { kind: 'text'; key: string; text: string }
  | {
      kind: 'file';
      key: string;
      fileId: string | null;
      filename: string;
      mediaType: string;
      url: string;
    }
  | { kind: 'tool'; key: string; toolName: string; state: ToolCallState }
  | { kind: 'highlight'; key: string; elementId: string };

const TOOL_STATES: readonly ToolCallState[] = [
  'input-streaming',
  'input-available',
  'approval-requested',
  'approval-responded',
  'output-available',
  'output-error',
  'output-denied',
];

function isToolState(value: unknown): value is ToolCallState {
  return (
    typeof value === 'string' &&
    (TOOL_STATES as readonly string[]).includes(value)
  );
}

function isFailedToolOutput(output: unknown): boolean {
  if (output === null || typeof output !== 'object') return false;
  const o = output as Record<string, unknown>;
  if (o.ok === false) return true;
  const err = o.error;
  if (err && typeof err === 'object') return true;
  return false;
}

export function classifyPart(
  part: unknown,
  idx: number,
): RenderablePart | null {
  if (typeof part !== 'object' || part === null) return null;
  const obj = part as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== 'string') return null;
  if (type === 'text' && typeof obj.text === 'string' && obj.text.length > 0) {
    return { kind: 'text', key: `text:${idx}`, text: obj.text };
  }
  if (type === 'file') {
    const url = typeof obj.url === 'string' ? obj.url : '';
    const mediaType =
      typeof obj.mediaType === 'string'
        ? obj.mediaType
        : 'application/octet-stream';
    const filename =
      typeof obj.filename === 'string' && obj.filename.length > 0
        ? obj.filename
        : 'attachment';
    const meta = obj.providerMetadata;
    let fileId: string | null = null;
    if (meta && typeof meta === 'object') {
      const ns = (meta as Record<string, unknown>)[CHAT_PROVIDER_METADATA_KEY];
      if (ns && typeof ns === 'object') {
        const candidate = (ns as Record<string, unknown>).fileId;
        if (typeof candidate === 'string' && candidate.length > 0) {
          fileId = candidate;
        }
      }
    }
    return {
      kind: 'file',
      key: `file:${idx}`,
      fileId,
      filename,
      mediaType,
      url,
    };
  }
  if (type.startsWith('tool-') || type === 'dynamic-tool') {
    const state = obj.state;
    if (!isToolState(state)) return null;
    const toolName =
      type === 'dynamic-tool'
        ? typeof obj.toolName === 'string'
          ? obj.toolName
          : 'tool'
        : type.slice('tool-'.length);
    const id = typeof obj.toolCallId === 'string' ? obj.toolCallId : `${idx}`;
    if (toolName === 'highlightUiElement') {
      const input = obj.input;
      if (input && typeof input === 'object') {
        const candidate = (input as Record<string, unknown>).elementId;
        if (typeof candidate === 'string' && isHelpElementId(candidate)) {
          return {
            kind: 'highlight',
            key: `highlight:${id}`,
            elementId: candidate,
          };
        }
      }
      return null;
    }
    if (isInternalTool(toolName)) return null;
    let effectiveState: ToolCallState = state;
    if (state === 'output-available' && isFailedToolOutput(obj.output)) {
      effectiveState = 'output-error';
    }
    return { kind: 'tool', key: `tool:${id}`, toolName, state: effectiveState };
  }
  return null;
}

function HighlightTrigger({ elementId }: { elementId: string }) {
  useEffect(() => {
    triggerHelpHighlight(elementId);
  }, [elementId]);
  return null;
}

const emptySubscribe = () => () => {};

function messageCreatedAt(message: UIMessage): Date | null {
  const meta = message.metadata;
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as Record<string, unknown>).createdAt;
  if (typeof raw !== 'string' && !(raw instanceof Date)) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  const renderable = message.parts
    .map((part, idx) => classifyPart(part, idx))
    .filter((p): p is RenderablePart => p !== null);

  if (renderable.length === 0) return null;

  const copyText = renderable
    .filter(
      (p): p is Extract<RenderablePart, { kind: 'text' }> => p.kind === 'text',
    )
    .map((p) => p.text)
    .join('\n\n');
  const createdAt = messageCreatedAt(message);

  return (
    <div
      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'flex min-w-0 flex-col gap-1.5 text-sm break-words',
          isUser
            ? 'max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-primary-foreground whitespace-pre-wrap selection:bg-primary-foreground selection:text-primary'
            : 'w-full text-foreground',
        )}
      >
        {renderable.map((part) => {
          if (part.kind === 'text') {
            if (isUser) return <span key={part.key}>{part.text}</span>;
            return <MarkdownContent key={part.key} text={part.text} />;
          }
          if (part.kind === 'file') {
            return (
              <AttachmentChip
                key={part.key}
                fileId={part.fileId}
                filename={part.filename}
                url={part.url}
                isUser={isUser}
              />
            );
          }
          if (part.kind === 'highlight') {
            return (
              <HighlightTrigger key={part.key} elementId={part.elementId} />
            );
          }
          return (
            <ToolCallChip
              key={part.key}
              toolName={part.toolName}
              state={part.state}
            />
          );
        })}
        {!isUser && <MessageFooter text={copyText} createdAt={createdAt} />}
      </div>
    </div>
  );
}

function MessageFooter({
  text,
  createdAt,
}: {
  text: string;
  createdAt: Date | null;
}) {
  const t = useTranslations('Home');
  const format = useFormatter();
  const [copied, setCopied] = useState(false);
  const [mountedAt] = useState(() => new Date());
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const time = createdAt ?? mountedAt;

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {text && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => void handleCopy()}
          title={copied ? t('copied') : t('copy')}
          className="text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      )}
      <span className="text-[11px]" suppressHydrationWarning>
        {mounted
          ? format.dateTime(time, {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            })
          : null}
      </span>
    </div>
  );
}

function AttachmentChip({
  fileId,
  filename,
  url,
  isUser,
}: {
  fileId: string | null;
  filename: string;
  url: string;
  isUser: boolean;
}) {
  const t = useTranslations('Home');
  const tErrors = useTranslations('Errors');
  const [loading, setLoading] = useState(false);

  const handleOpen = async (): Promise<void> => {
    if (loading) return;
    if (!fileId) {
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/files/download-urls', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [fileId] }),
      });
      if (!res.ok) {
        toast.error(tErrors('description'));
        return;
      }
      const data = (await res.json()) as {
        urls: Record<string, { url: string }>;
      };
      const fresh = data.urls[fileId]?.url;
      if (fresh) {
        window.open(fresh, '_blank', 'noopener,noreferrer');
      } else if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        toast.error(tErrors('description'));
      }
    } catch {
      toast.error(tErrors('description'));
    } finally {
      setLoading(false);
    }
  };

  const ext = filename.split('.').pop()?.toUpperCase() ?? '';
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => void handleOpen()}
      disabled={loading}
      title={t('openAttachment')}
      className={cn(
        'h-auto w-fit max-w-full justify-start gap-2 border px-2.5 py-1.5 text-left',
        isUser
          ? 'border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground'
          : 'border-border bg-card hover:bg-mist',
      )}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded',
          isUser ? 'bg-primary-foreground/15' : 'bg-linen',
        )}
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <FileText className="size-3.5" />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[11px] font-medium">{filename}</span>
        {ext && (
          <span
            className={cn(
              'text-[9px] font-semibold uppercase',
              isUser ? 'opacity-70' : 'text-muted-foreground',
            )}
          >
            {ext}
          </span>
        )}
      </span>
    </Button>
  );
}
