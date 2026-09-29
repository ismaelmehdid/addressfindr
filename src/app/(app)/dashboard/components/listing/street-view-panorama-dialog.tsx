'use client';

import { ArrowUpRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { GeoPoint } from '@/core/geo/types';
import {
  streetViewEmbedUrl,
  streetViewPanoramaUrl,
} from '@/core/street-view/links';

export function StreetViewPanoramaDialog({
  point,
  address,
  apiKey,
  triggerClassName,
}: {
  point: GeoPoint;
  address: string;
  apiKey: string;
  triggerClassName: string;
}) {
  const t = useTranslations('Listing');

  return (
    <Dialog>
      <DialogTrigger
        aria-label={t('detailStreetViewExplore')}
        className={triggerClassName}
      />
      <DialogContent
        showCloseButton={false}
        className="flex h-svh max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[85svh] sm:max-w-[min(92vw,1280px)] sm:rounded-xl"
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pr-2 pl-4">
          <DialogTitle className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
            {t('streetViewDialogTitle', { address })}
          </DialogTitle>
          <a
            href={streetViewPanoramaUrl(point)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            {t.rich('streetViewDialogOpenInMaps', {
              hidden: (chunks) => <span className="sr-only">{chunks}</span>,
            })}
            <ArrowUpRight aria-hidden />
          </a>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('streetViewDialogClose')}
              />
            }
          >
            <X />
          </DialogClose>
        </div>
        {/* why: the key is restricted by referrer, so Google must receive this origin. */}
        <iframe
          title={t('streetViewDialogFrame')}
          src={streetViewEmbedUrl(point, apiKey)}
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="min-h-0 w-full flex-1 border-0 bg-mist"
        />
      </DialogContent>
    </Dialog>
  );
}
