'use client';

import { House, MapPinOff } from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { reliableFloor, streetLine } from '@/core/ademe/record-facts';
import { scoreBand, scoreFromConfidence } from '@/core/ademe/score-scale';
import type { AddressCandidate } from '@/core/ademe/types';
import { cn } from '@/lib/utils';
import { SCORE_LABEL_KEY, scoreStyle } from './score-style';
import { useCandidatePhoto } from './use-candidate-photo';

type CardOptions = {
  selectedDpeNumber: string | null;
  onSelect: (dpeNumber: string) => void;
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

function RankBadge({ rank }: { rank: number }) {
  return (
    <Badge className="size-6 rounded-full bg-(--score) p-0 text-[12px] font-semibold text-(--score-ink) tabular-nums shadow-sm">
      {rank}
    </Badge>
  );
}

function ScorePill({ score }: { score: number }) {
  const t = useTranslations('Listing');

  return (
    <Badge className="h-6 rounded-full bg-(--score) px-2 text-[12px] font-semibold text-(--score-ink) tabular-nums shadow-sm">
      {t.rich('addressScore', {
        score,
        muted: (chunks) => <span className="font-medium">{chunks}</span>,
      })}
      <span className="sr-only">{t(SCORE_LABEL_KEY[scoreBand(score)])}</span>
    </Badge>
  );
}

function CandidateCard({
  candidate,
  rank,
  selectedDpeNumber,
  onSelect,
  streetViewEnabled,
}: CardOptions & { candidate: AddressCandidate; rank: number }) {
  const t = useTranslations('Listing');
  const format = useFormatter();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { record } = candidate;
  const { photo, onPhotoError } = useCandidatePhoto({
    point: record.point,
    streetViewEnabled,
  });
  const selected = record.dpeNumber === selectedDpeNumber;
  const dimmed = selectedDpeNumber !== null && !selected;
  const score = scoreFromConfidence(candidate.confidence);
  const floor = reliableFloor(record);
  const wasSelected = useRef(selected);

  // why: scroll only when the selection arrives on this card. On first render
  // the top card is already at the top; scrolling would hide the section title
  // on a phone, where a card is taller than the panel.
  useEffect(() => {
    if (selected && !wasSelected.current) {
      cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    wasSelected.current = selected;
  }, [selected]);

  const meta = [
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
    floor === null ? null : t('addressFloor', { floor }),
    record.landSurfaceM2 === null
      ? null
      : t('addressLand', {
          surface: format.number(record.landSurfaceM2, {
            maximumFractionDigits: 0,
          }),
        }),
    record.yearBuilt === null
      ? null
      : t('cardYearBuilt', {
          year: String(record.yearBuilt),
          type: record.propertyType ?? 'unknown',
        }),
  ].filter((fact) => fact !== null);

  return (
    <Card
      ref={cardRef}
      size="sm"
      style={scoreStyle(score)}
      className={cn(
        // why: the primitive's data-[size=sm] spacing outranks a plain override
        'gap-0 py-0 data-[size=sm]:gap-0 data-[size=sm]:py-0 transition-[opacity,background-color,box-shadow]',
        // why: the Card clips the button's own focus ring (overflow-hidden,
        // no padding), so the focus outline is drawn on the Card, outside
        // the clip and clear of the selected card's score ring.
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-charcoal',
        selected && 'bg-(--score-tint) ring-2 ring-(--score)',
        dimmed &&
          'lg:opacity-60 lg:hover:opacity-100 lg:has-focus-visible:opacity-100',
      )}
    >
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => {
          onSelect(record.dpeNumber);
        }}
        className="group/candidate flex w-full cursor-pointer flex-col text-left outline-none transition-colors hover:bg-foreground/3"
      >
        {photo.kind === 'none' ? (
          <div className="flex h-[172px] w-full items-center justify-center bg-mist">
            <House
              aria-hidden
              className="size-8 text-pebble"
              strokeWidth={1.25}
            />
          </div>
        ) : (
          <div className="relative h-[172px] w-full overflow-hidden bg-mist">
            <Skeleton className="absolute inset-0 rounded-none" />
            <Image
              key={photo.src}
              unoptimized
              fill
              sizes="360px"
              src={photo.src}
              alt={
                photo.kind === 'street-view'
                  ? t('streetViewAlt', { address: record.address })
                  : t('aerialAlt', { address: record.address })
              }
              onError={onPhotoError}
              className="object-cover"
            />
            <span className="absolute top-2.5 left-2.5">
              <RankBadge rank={rank} />
            </span>
            <span className="absolute top-2.5 right-2.5">
              <ScorePill score={score} />
            </span>
            <Badge variant="secondary" className="absolute bottom-2.5 left-2.5">
              {photo.kind === 'street-view'
                ? t('streetViewBadge')
                : t('photoSatellite')}
            </Badge>
          </div>
        )}
        <CardHeader className="pt-3">
          {photo.kind === 'none' && (
            <div className="mb-1 flex items-center justify-between gap-2">
              <RankBadge rank={rank} />
              <ScorePill score={score} />
            </div>
          )}
          <CardTitle
            className={cn(
              'text-[15px] leading-snug text-ink group-data-[size=sm]/card:text-[15px]',
              selected ? 'font-semibold' : 'font-medium',
            )}
          >
            {streetLine(record)}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-2 pb-3">
          <Progress
            value={score}
            aria-hidden
            className="[&_[data-slot=progress-indicator]]:bg-(--score) [&_[data-slot=progress-track]]:bg-(--score)/20"
          />
          {meta.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              {meta.join(' · ')}
            </p>
          )}
          {record.point === null && (
            <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
              <MapPinOff className="size-3 shrink-0" aria-hidden />
              {t('addressNoPoint')}
            </p>
          )}
          {rank === 1 && (
            <span
              className={buttonVariants({
                className: 'mt-1 w-full group-hover/candidate:bg-charcoal-deep',
              })}
            >
              {t('cardVerify')}
            </span>
          )}
        </CardContent>
      </button>
    </Card>
  );
}
