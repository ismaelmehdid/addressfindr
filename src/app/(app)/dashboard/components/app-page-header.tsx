'use client';

import { ChevronRight, CircleHelp, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ChatToggleButton } from './chat-toggle-button';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type PrimaryActionConfig = {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  dataHelpId?: string;
};

type Props = {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  count?: number;
  primaryAction?: PrimaryActionConfig;
  rightContent?: ReactNode;
  helpTooltip?: string;
};

export function AppPageHeader({
  title,
  breadcrumbs,
  count,
  primaryAction,
  rightContent,
  helpTooltip,
}: Props) {
  return (
    <div className="z-50 grid h-10 shrink-0 items-center border-b border-stone/70 bg-linen px-3">
      <div className="flex min-w-0 items-center justify-between">
        <div className="flex min-w-0 items-center gap-1.5">
          {breadcrumbs ? (
            <Breadcrumb items={breadcrumbs} trailingTitle={title} />
          ) : (
            <div className="flex min-w-0 items-baseline gap-1.5">
              <h1 className="truncate text-[13px] font-semibold tracking-[-0.08px] text-ink">
                {title}
              </h1>
              {count !== undefined && (
                <span className="text-[12px] font-normal text-slate-neutral tabular-nums">
                  {count}
                </span>
              )}
            </div>
          )}
          {helpTooltip && <HelpHint text={helpTooltip} />}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {rightContent}
          {primaryAction && (
            <Button
              size="sm"
              onClick={primaryAction.onClick}
              data-help-id={primaryAction.dataHelpId}
            >
              {primaryAction.icon && (
                <primaryAction.icon className="size-3.5" />
              )}
              {primaryAction.label}
            </Button>
          )}
          <ChatToggleButton />
        </div>
      </div>
    </div>
  );
}

function HelpHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={text}
            className="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-pebble transition-colors hover:text-slate-neutral focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pebble"
          >
            <CircleHelp className="size-3.5" strokeWidth={1.5} />
          </button>
        }
      />
      <TooltipContent
        side="bottom"
        align="start"
        className="max-w-xs whitespace-normal text-left leading-snug text-balance"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function Breadcrumb({
  items,
  trailingTitle,
}: {
  items: BreadcrumbItem[];
  trailingTitle: string;
}) {
  const all: BreadcrumbItem[] = [...items, { label: trailingTitle }];
  return (
    <nav className="flex min-w-0 items-center gap-1">
      {all.map((item, index) => {
        const isLast = index === all.length - 1;
        return (
          <div
            key={item.href ?? item.label}
            className={cn(
              'flex items-center gap-1',
              isLast ? 'min-w-0' : 'flex-shrink-0',
            )}
          >
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-[13px] font-medium tracking-[-0.08px] text-slate-neutral transition-colors hover:text-ink"
              >
                <span>{item.label}</span>
              </Link>
            ) : (
              <span
                className={cn(
                  'truncate text-[13px] tracking-[-0.08px]',
                  isLast
                    ? 'font-semibold text-ink'
                    : 'font-medium text-slate-neutral',
                )}
              >
                {item.label}
              </span>
            )}
            {!isLast && (
              <ChevronRight
                className="mx-0.5 size-3.5 text-pebble"
                strokeWidth={1.5}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
