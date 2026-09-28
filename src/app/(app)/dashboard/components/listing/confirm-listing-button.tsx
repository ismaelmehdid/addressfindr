'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SearchFeedback } from './use-search-feedback';

export function ConfirmListingButton({
  feedback,
  dpeNumber,
}: {
  feedback: SearchFeedback;
  dpeNumber: string;
}): React.ReactElement | null {
  const t = useTranslations('ListingFeedback');
  // why: the spinner stays on the button that was pressed, even when the
  // panel is reused for another candidate.
  const [pressedFor, setPressedFor] = useState<string | null>(null);
  const { verdict, verdictStatus, verdictFailure } = feedback;

  if (verdict.kind === 'confirmed') {
    if (verdict.dpeNumber !== dpeNumber) return null;
    return (
      <p
        role="status"
        className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-charcoal-soft text-[14px] font-medium text-ink"
      >
        <Check className="size-4" aria-hidden />
        {t('confirmed')}
      </p>
    );
  }
  if (verdict.kind === 'none_match') return null;

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
        loading={verdictStatus === 'sending' && pressedFor === dpeNumber}
        onClick={() => {
          setPressedFor(dpeNumber);
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
