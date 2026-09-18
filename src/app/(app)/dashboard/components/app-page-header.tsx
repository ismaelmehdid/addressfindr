'use client';

import { ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type PrimaryActionConfig = {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
};

type Props = {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  count?: number;
  primaryAction?: PrimaryActionConfig;
  rightContent?: ReactNode;
};

export function AppPageHeader({
  title,
  breadcrumbs,
  count,
  primaryAction,
  rightContent,
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
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {rightContent}
          {primaryAction && (
            <Button size="sm" onClick={primaryAction.onClick}>
              {primaryAction.icon && (
                <primaryAction.icon className="size-3.5" />
              )}
              {primaryAction.label}
            </Button>
          )}
        </div>
      </div>
    </div>
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
