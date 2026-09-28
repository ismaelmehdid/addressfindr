'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useFocusWhenShown } from './use-focus-when-shown';
import type { SearchFeedback } from './use-search-feedback';

export function ConfirmListingButton({
  feedback,
  dpeNumber,
}: {
  feedback: SearchFeedback;
  dpeNumber: string;
}): React.ReactElement | null {
  const t = useTranslations('ListingFeedback');
  const { verdict, verdictStatus, verdictPending, verdictFailure } = feedback;
  const confirmationRef = useRef<HTMLParagraphElement>(null);
  const focusConfirmationWhenShown = useFocusWhenShown(
    confirmationRef,
    verdict.kind === 'confirmed' && verdict.dpeNumber === dpeNumber,
  );

  if (verdict.kind === 'confirmed') {
    if (verdict.dpeNumber !== dpeNumber) return null;
    return (
      <p
        ref={confirmationRef}
        role="status"
        tabIndex={-1}
        className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-charcoal-soft text-[14px] font-medium text-ink outline-none"
      >
        <Check className="size-4" aria-hidden />
        {t('confirmed')}
      </p>
    );
  }
  if (verdict.kind === 'none_match') return null;

  const pending =
    verdictPending?.kind === 'confirmed' &&
    verdictPending.dpeNumber === dpeNumber;
  const failed =
    verdictFailure?.kind === 'confirmed' &&
    verdictFailure.dpeNumber === dpeNumber;
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={verdictStatus === 'sending'}
        loading={pending}
        onClick={() => {
          focusConfirmationWhenShown();
          feedback.confirm(dpeNumber);
        }}
      >
        <Check />
        {t('confirm')}
      </Button>
      {failed && (
        <p role="alert" className="text-[13px] text-destructive">
          {t('failed')}
        </p>
      )}
    </div>
  );
}
