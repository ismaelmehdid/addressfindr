'use client';

import {
  AlertCircle,
  Check,
  Loader2,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const KNOWN_TOOLS = [
  'searchUserFiles',
  'searchFileText',
  'listFiles',
  'fetchUrl',
  'webSearch',
] as const;
type KnownTool = (typeof KNOWN_TOOLS)[number];

function isKnownTool(name: string): name is KnownTool {
  return (KNOWN_TOOLS as readonly string[]).includes(name);
}

const INTERNAL_TOOLS: ReadonlySet<string> = new Set([
  'updateWorkingMemory',
  'highlightUiElement',
]);

export function isInternalTool(name: string): boolean {
  return INTERNAL_TOOLS.has(name);
}

export type ToolCallState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

type Props = {
  toolName: string;
  state: ToolCallState;
};

export function ToolCallChip({ toolName, state }: Props) {
  const t = useTranslations('ChatTools');

  const label = isKnownTool(toolName) ? t(toolName) : toolName;

  if (state === 'input-streaming' || state === 'input-available') {
    return (
      <Chip tone="pending" icon={<Loader2 className="size-3 animate-spin" />}>
        {t('calling', { tool: label })}
      </Chip>
    );
  }
  if (state === 'output-available') {
    return (
      <Chip tone="success" icon={<Check className="size-3" />}>
        {t('completed', { tool: label })}
      </Chip>
    );
  }
  if (state === 'output-error') {
    return (
      <Chip tone="error" icon={<XCircle className="size-3" />}>
        {t('failed', { tool: label })}
      </Chip>
    );
  }
  if (state === 'approval-requested' || state === 'approval-responded') {
    return (
      <Chip tone="warn" icon={<ShieldAlert className="size-3" />}>
        {t('approvalNeeded', { tool: label })}
      </Chip>
    );
  }
  return (
    <Chip tone="error" icon={<AlertCircle className="size-3" />}>
      {t('denied', { tool: label })}
    </Chip>
  );
}

function Chip({
  children,
  icon,
  tone,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  tone: 'pending' | 'success' | 'error' | 'warn';
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        tone === 'pending' && 'bg-mist/60 text-slate-neutral',
        tone === 'success' && 'bg-mist/40 text-charcoal',
        tone === 'error' && 'bg-destructive/10 text-destructive',
        tone === 'warn' && 'bg-amber-500/10 text-amber-700',
      )}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
}
