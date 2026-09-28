'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ResultsPager({
  rank,
  total,
  onPrevious,
  onNext,
  className,
}: {
  rank: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
}) {
  const t = useTranslations('Listing');

  return (
    <div
      role="group"
      aria-label={t('resultsPager')}
      className={cn('flex items-center gap-1', className)}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('addressPrevious')}
        onClick={onPrevious}
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-10 text-center text-[12px] tabular-nums text-muted-foreground">
        {t('addressPager', { index: rank, total })}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('addressNext')}
        onClick={onNext}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
