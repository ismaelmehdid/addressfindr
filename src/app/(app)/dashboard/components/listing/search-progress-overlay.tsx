'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { SUSPENDS_DETAIL_SHORTCUTS } from './use-detail-shortcuts';
import type { SearchStep } from './use-listing-search';

// why: gsap and the animation are downloaded the first time a search runs,
// not on every dashboard visit.
const SpiralAnimation = dynamic(
  () =>
    import('@/components/ui/spiral-animation').then(
      (module) => module.SpiralAnimation,
    ),
  { ssr: false },
);

export function SearchProgressOverlay({
  step,
  onCancel,
  returnFocusTo,
}: {
  step: SearchStep | null;
  onCancel: () => void;
  returnFocusTo: () => HTMLElement | null;
}) {
  const t = useTranslations('Listing');
  const popupRef = useRef<HTMLDivElement | null>(null);
  // why: the last step stays on screen while the overlay fades out, so the
  // text never flashes to an error or to nothing on the way out.
  const [shownStep, setShownStep] = useState<SearchStep>(step ?? 'analyzing');
  if (step !== null && step !== shownStep) setShownStep(step);

  return (
    <Dialog
      open={step !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      disablePointerDismissal
    >
      <DialogContent
        {...SUSPENDS_DETAIL_SHORTCUTS}
        ref={popupRef}
        showCloseButton={false}
        // why: focus on the popup, not on Cancel, so an Enter pressed again
        // right after submitting does not abandon the search.
        initialFocus={popupRef}
        // why: after a search that found addresses the home field is gone and
        // the results heading takes focus, and a new search's dialog reopens
        // on its own field; focus goes back to the home field only when it is
        // still there to correct the link.
        finalFocus={() => returnFocusTo() ?? false}
        // why: the page's own background, with no dimmed or blurred backdrop,
        // so the search fades in and out without the screen changing colour.
        overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-none"
        className="inset-0 flex h-dvh max-w-none translate-x-0 translate-y-0 flex-col items-center justify-end gap-0 overflow-hidden rounded-none bg-linen p-0 text-ink ring-0 duration-300 sm:max-w-none"
      >
        <SpiralAnimation className="absolute inset-0" />
        <div className="relative flex flex-col items-center gap-5 px-4 pb-[max(3rem,env(safe-area-inset-bottom))] text-center">
          <DialogTitle className="sr-only">
            {t('searchProgressTitle')}
          </DialogTitle>
          <DialogDescription
            aria-live="polite"
            className="text-[13px] font-medium uppercase tracking-[0.2em] text-graphite motion-safe:animate-pulse"
          >
            {t(shownStep)}
          </DialogDescription>
          <DialogClose render={<Button variant="ghost" size="sm" />}>
            {t('searchCancel')}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
