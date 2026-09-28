'use client';

import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  FEEDBACK_REASONS,
  type FeedbackReason,
  isFeedbackReason,
  MAX_FEEDBACK_COMMENT_LENGTH,
} from '@/core/listing/feedback';
import { useFocusWhenShown } from './use-focus-when-shown';
import type { SearchFeedback } from './use-search-feedback';

const REASON_KEY = {
  wrong_commune: 'reasonWrongCommune',
  wrong_dwellings: 'reasonWrongDwellings',
  address_missing: 'reasonAddressMissing',
  unsure: 'reasonUnsure',
} as const satisfies Record<FeedbackReason, string>;

export function MissingListingFeedback({
  feedback,
}: {
  feedback: SearchFeedback;
}): React.ReactElement {
  const t = useTranslations('ListingFeedback');
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [comment, setComment] = useState('');
  const reasonLabelId = useId();
  const commentId = useId();
  const commentNoteId = useId();
  const {
    verdict,
    verdictStatus,
    verdictPending,
    verdictFailure,
    detailStatus,
  } = feedback;
  const canSendDetail = reason !== null || comment.trim() !== '';
  const thanksRef = useRef<HTMLParagraphElement>(null);
  const detailSentRef = useRef<HTMLParagraphElement>(null);
  const focusThanksWhenShown = useFocusWhenShown(
    thanksRef,
    verdict.kind === 'none_match' && !verdict.detailSent,
  );
  const focusDetailSentWhenShown = useFocusWhenShown(
    detailSentRef,
    verdict.kind === 'none_match' && verdict.detailSent,
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSendDetail) return;
    focusDetailSentWhenShown();
    feedback.sendDetail({ reason, comment });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <SearchX className="size-4 shrink-0" aria-hidden />
          {t('missingTitle')}
        </CardTitle>
        <CardDescription className="text-[13px]">
          {t('missingBody')}
        </CardDescription>
      </CardHeader>
      {verdict.kind === 'none' && (
        <CardContent className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={verdictStatus === 'sending'}
            loading={verdictPending?.kind === 'none_match'}
            onClick={() => {
              focusThanksWhenShown();
              feedback.reportNoneMatch();
            }}
          >
            {t('noneMatch')}
          </Button>
          {verdictFailure?.kind === 'none_match' && (
            <p role="alert" className="text-[13px] text-destructive">
              {t('failed')}
            </p>
          )}
        </CardContent>
      )}
      {verdict.kind === 'none_match' && verdict.detailSent && (
        <CardContent>
          <p
            ref={detailSentRef}
            role="status"
            tabIndex={-1}
            className="text-[13px] font-medium text-ink outline-none"
          >
            {t('detailSent')}
          </p>
        </CardContent>
      )}
      {verdict.kind === 'none_match' && !verdict.detailSent && (
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <p
              ref={thanksRef}
              role="status"
              tabIndex={-1}
              className="text-[13px] font-medium text-ink outline-none"
            >
              {t('thanks')}
            </p>
            <div className="flex flex-col gap-2">
              <p
                id={reasonLabelId}
                className="text-[13px] font-medium text-graphite"
              >
                {t('reasonLegend')}
              </p>
              <RadioGroup
                aria-labelledby={reasonLabelId}
                value={reason}
                onValueChange={(value) => {
                  if (isFeedbackReason(value)) setReason(value);
                }}
              >
                {FEEDBACK_REASONS.map((option) => (
                  <Label
                    key={option}
                    className="items-start gap-2.5 text-[13px] leading-snug font-normal text-ink"
                  >
                    <RadioGroupItem value={option} className="mt-px" />
                    {t(REASON_KEY[option])}
                  </Label>
                ))}
              </RadioGroup>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={commentId}
                className="text-[13px] font-medium text-graphite"
              >
                {t('commentLabel')}
              </Label>
              <Textarea
                id={commentId}
                value={comment}
                maxLength={MAX_FEEDBACK_COMMENT_LENGTH}
                aria-describedby={commentNoteId}
                onChange={(event) => {
                  setComment(event.target.value);
                }}
              />
              <p
                id={commentNoteId}
                className="text-[12px] text-muted-foreground"
              >
                {t('commentNote')}
              </p>
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={!canSendDetail}
              loading={detailStatus === 'sending'}
            >
              {t('send')}
            </Button>
            {detailStatus === 'failed' && (
              <p role="alert" className="text-[13px] text-destructive">
                {t('failed')}
              </p>
            )}
          </form>
        </CardContent>
      )}
    </Card>
  );
}
