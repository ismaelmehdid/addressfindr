'use client';

import { MapPinOff } from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { streetLine } from '@/core/ademe/record-facts';
import type { AddressCandidate } from '@/core/ademe/types';
import { streetViewImagePath } from '@/core/street-view/links';
import { cn } from '@/lib/utils';

type CardOptions = {
  shownDpeNumber: string | null;
  onSelect?: (dpeNumber: string) => void;
  streetViewEnabled: boolean;
};

export function AddressCandidateList({
  candidates,
  ...options
}: CardOptions & { candidates: readonly AddressCandidate[] }) {
  const t = useTranslations('Listing');
  const [top, ...others] = candidates;
  if (top === undefined) return null;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2.5">
        <div className="px-0.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-graphite">
            {t('addressTopLabel')}
          </h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {t('addressTopHint')}
          </p>
        </div>
        <CandidateCard candidate={top} rank={1} {...options} />
      </section>
      {others.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="px-0.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-graphite">
              {t('addressOthersLabel')}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {t('addressOthersHint', { count: others.length })}
            </p>
          </div>
          <ol start={2} className="flex flex-col gap-3">
            {others.map((candidate, index) => (
              <li key={candidate.record.dpeNumber}>
                <CandidateCard
                  candidate={candidate}
                  rank={index + 2}
                  {...options}
                />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  rank,
  shownDpeNumber,
  onSelect,
  streetViewEnabled,
}: CardOptions & { candidate: AddressCandidate; rank: number }) {
  const t = useTranslations('Listing');
  const format = useFormatter();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const { record } = candidate;
  const isShown = record.dpeNumber === shownDpeNumber;
  const emphasised = rank === 1 || isShown;
  const selectable = onSelect !== undefined;
  const score = Math.round(candidate.confidence * 100);
  const wasShown = useRef(isShown);

  // why: scroll only when the selection arrives on this card. On first render
  // the top card is already at the top; scrolling would hide the section title
  // on a phone, where a card is taller than the panel.
  useEffect(() => {
    if (isShown && !wasShown.current && selectable) {
      cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    wasShown.current = isShown;
  }, [isShown, selectable]);

  const facts = [
    record.city,
    record.propertyType === 'apartment'
      ? t('addressPropertyApartment')
      : record.propertyType === 'house'
        ? t('addressPropertyHouse')
        : null,
    record.surfaceM2 === null
      ? null
      : t('addressSurface', {
          surface: format.number(record.surfaceM2, {
            maximumFractionDigits: 1,
          }),
        }),
    record.yearBuilt === null
      ? null
      : t('addressYearBuilt', { year: String(record.yearBuilt) }),
  ].filter((fact) => fact !== null);

  const body = (
    <>
      {streetViewEnabled && record.point !== null && !photoFailed && (
        <div className="relative aspect-[2/1]">
          <Skeleton className="absolute inset-0 rounded-none" />
          <Image
            unoptimized
            fill
            sizes="360px"
            src={streetViewImagePath(record.point)}
            alt={t('streetViewAlt', { address: record.address })}
            onError={() => {
              setPhotoFailed(true);
            }}
            className={cn('object-cover', !emphasised && 'saturate-50')}
          />
          <Badge variant="secondary" className="absolute bottom-2.5 left-2.5">
            {t('streetViewBadge')}
          </Badge>
        </div>
      )}
      <CardHeader className="pt-3">
        <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
          <Badge variant={emphasised ? 'default' : 'secondary'}>{rank}</Badge>
          {streetLine(record)}
        </CardTitle>
        {facts.length > 0 && (
          <CardDescription>{facts.join(' · ')}</CardDescription>
        )}
        <CardAction>
          <Badge variant="outline" className="tabular-nums">
            {t.rich('addressScore', {
              score,
              muted: (chunks) => (
                <span className="text-muted-foreground">{chunks}</span>
              ),
            })}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pb-3">
        <Progress value={score} aria-hidden />
        {record.point === null && (
          <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <MapPinOff className="size-3 shrink-0" aria-hidden />
            {t('addressNoPoint')}
          </p>
        )}
      </CardContent>
    </>
  );

  return (
    <Card
      ref={cardRef}
      size="sm"
      className={cn('gap-0 py-0', isShown && 'ring-2 ring-primary')}
    >
      {onSelect === undefined ? (
        body
      ) : (
        <button
          type="button"
          aria-current={isShown ? 'true' : undefined}
          onClick={() => {
            onSelect(record.dpeNumber);
          }}
          className="flex w-full cursor-pointer flex-col text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted"
        >
          {body}
        </button>
      )}
    </Card>
  );
}
