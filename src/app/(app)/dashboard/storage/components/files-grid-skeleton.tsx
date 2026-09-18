/** biome-ignore-all lint/suspicious/noArrayIndexKey: static skeleton, count is fixed */

'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function FilesGridSkeleton() {
  return (
    <div className="grid gap-4 p-4 grid-cols-[repeat(auto-fill,minmax(max(160px,calc((100%-2*1rem)/3)),1fr))]">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={`s-${i}`}
          className="overflow-hidden rounded-xl border border-stone"
        >
          <Skeleton className="aspect-[595/842] w-full" />
          <div className="space-y-1 border-t border-stone p-2.5">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
