'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: Props) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center',
        className,
      )}
    >
      <Icon className="size-10 text-pebble" strokeWidth={1.25} />
      <div className="flex max-w-sm flex-col items-center gap-1.5">
        <p className="text-[15px] font-semibold tracking-tight text-ink">
          {title}
        </p>
        {description ? (
          <p className="text-sm text-slate-neutral text-balance">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
