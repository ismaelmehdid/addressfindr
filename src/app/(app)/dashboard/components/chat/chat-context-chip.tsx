'use client';

import { Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ActiveContextRef } from '@/core/chat/active-context';
import { useContextName } from './use-active-context';

export function activeContextRoute(
  kind: ActiveContextRef['kind'],
  id: string,
): string {
  switch (kind) {
    case 'storage-file':
      return `/dashboard/storage/${id}`;
  }
}

const ICON_BY_KIND = {
  'storage-file': Paperclip,
} as const;

export function ChatContextChip({
  context,
}: {
  context: ActiveContextRef | null;
}) {
  const t = useTranslations('Chat');
  const name = useContextName(context);
  if (!context || !name) return null;

  const Icon = ICON_BY_KIND[context.kind];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={activeContextRoute(context.kind, context.id)}
            className="flex max-w-[180px] items-center gap-1 rounded-md border border-border bg-mist px-2 py-1 text-xs text-muted-foreground hover:bg-stone hover:text-foreground"
          >
            <Icon className="size-3 shrink-0" />
            <span className="truncate">{name}</span>
          </Link>
        }
      />
      <TooltipContent>{t('activeContext')}</TooltipContent>
    </Tooltip>
  );
}
