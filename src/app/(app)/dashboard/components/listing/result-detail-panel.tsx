'use client';

import { Check, Copy, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  copyableAddress,
  factAgreement,
  placeLine,
  reliableFloor,
  shownDpeDate,
  streetLine,
} from '@/core/ademe/record-facts';
import { scoreBand, scoreFromConfidence } from '@/core/ademe/score-scale';
import type { AddressCandidate } from '@/core/ademe/types';
import type {
  EnergyClass,
  ExtractedValues,
  HeatingEnergy,
} from '@/core/listing/types';
import { cn } from '@/lib/utils';
import { ResultDetailPhoto } from './result-detail-photo';
import { ResultsPager } from './results-pager';
import { SCORE_LABEL_KEY, scoreStyle } from './score-style';
import { useCopyAddress } from './use-copy-address';
import { VerifyElsewhere } from './verify-elsewhere';

type LetterColour = { background: string; letter: 'ink' | 'white' };

// why: the official DPE and GES label colours encode the letter itself; like
// the score ramp they are an exception to the single accent colour. Each
// letter is set in whichever of ink or white contrasts more with its square.
const DPE_COLOUR = {
  A: { background: '#00a06d', letter: 'ink' },
  B: { background: '#52b153', letter: 'ink' },
  C: { background: '#cbd934', letter: 'ink' },
  D: { background: '#f4e70f', letter: 'ink' },
  E: { background: '#f0b40f', letter: 'ink' },
  F: { background: '#eb8235', letter: 'ink' },
  G: { background: '#d7221f', letter: 'white' },
} as const satisfies Record<EnergyClass, LetterColour>;

const GES_COLOUR = {
  A: { background: '#f2e9fb', letter: 'ink' },
  B: { background: '#e0c7f7', letter: 'ink' },
  C: { background: '#cda6f2', letter: 'ink' },
  D: { background: '#ba85ee', letter: 'ink' },
  E: { background: '#a663e9', letter: 'white' },
  F: { background: '#9341e5', letter: 'white' },
  G: { background: '#7f1fe0', letter: 'white' },
} as const satisfies Record<EnergyClass, LetterColour>;

const HEATING_KEY = {
  gas: 'heatingGas',
  electricity: 'heatingElectricity',
  'district-heating': 'heatingDistrictHeating',
  'fuel-oil': 'heatingFuelOil',
  wood: 'heatingWood',
  lpg: 'heatingLpg',
  coal: 'heatingCoal',
} as const satisfies Record<HeatingEnergy, string>;

type Fact = {
  label: string;
  value: string;
  agrees: boolean;
};

type DetailListing = Pick<
  ExtractedValues,
  | 'propertyType'
  | 'surfaceM2'
  | 'yearBuilt'
  | 'heatingEnergy'
  | 'floor'
  | 'dpeDate'
>;

export function ResultDetailPanel({
  candidate,
  rank,
  total,
  onPrevious,
  onNext,
  onClose,
  streetViewEnabled,
  listing,
}: {
  candidate: AddressCandidate;
  rank: number;
  total: number;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  streetViewEnabled: boolean;
  listing: DetailListing;
}) {
  const t = useTranslations('Listing');

  // why: the header (and its pager/close buttons) stays mounted across a
  // selection change, so keyboard focus on one of its buttons survives
  // "Résultat suivant"/"précédent" instead of dropping to <body>. Only the
  // photo and the body below, keyed on the shown result, reset their state.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <p className="text-[13px] font-semibold text-ink">
          {t('detailTitle', { rank })}
        </p>
        <div className="flex items-center gap-1">
          {onPrevious !== null && onNext !== null && (
            <ResultsPager
              rank={rank}
              total={total}
              onPrevious={onPrevious}
              onNext={onNext}
              className="gap-0.5"
            />
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('detailClose')}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
      <ResultDetailPhoto
        key={`photo:${candidate.record.dpeNumber}`}
        record={candidate.record}
        streetViewEnabled={streetViewEnabled}
      />
      <ResultDetailBody
        key={`body:${candidate.record.dpeNumber}`}
        candidate={candidate}
        rank={rank}
        listing={listing}
      />
    </div>
  );
}

function EnergyBadge({
  label,
  letter,
}: {
  label: 'dpe' | 'ges';
  letter: EnergyClass;
}) {
  const t = useTranslations('Listing');
  const colour = label === 'dpe' ? DPE_COLOUR[letter] : GES_COLOUR[letter];
  const square = (chunks: ReactNode) => (
    <span
      className={cn(
        'flex size-5 items-center justify-center rounded-[3px] text-[12px] font-bold',
        colour.letter === 'white' ? 'text-white' : 'text-ink',
      )}
      style={{ backgroundColor: colour.background }}
    >
      {chunks}
    </span>
  );

  return (
    <Badge variant="outline" className="h-7 gap-1.5 py-0 pr-1 pl-2 text-[12px]">
      {label === 'dpe'
        ? t.rich('detailDpe', { letter, square })
        : t.rich('detailGes', { letter, square })}
    </Badge>
  );
}

function ResultDetailBody({
  candidate,
  rank,
  listing,
}: {
  candidate: AddressCandidate;
  rank: number;
  listing: DetailListing;
}) {
  const t = useTranslations('Listing');
  const format = useFormatter();
  const { record } = candidate;
  const score = scoreFromConfidence(candidate.confidence);
  const place = placeLine(record);
  const floor = reliableFloor(record);
  const date = shownDpeDate(record, listing.dpeDate);
  const agreement = factAgreement(record, listing);
  const { status: copyStatus, copy } = useCopyAddress(copyableAddress(record));

  const facts: Fact[] = [
    record.propertyType === null
      ? null
      : {
          label: t('factType'),
          value:
            record.propertyType === 'apartment'
              ? t('addressPropertyApartment')
              : t('addressPropertyHouse'),
          agrees: agreement.propertyType,
        },
    record.surfaceM2 === null
      ? null
      : {
          label: t('factSurface'),
          value: t('addressSurface', {
            surface: format.number(record.surfaceM2, {
              maximumFractionDigits: 1,
            }),
          }),
          agrees: agreement.surfaceM2,
        },
    floor === null
      ? null
      : {
          label: t('factFloor'),
          value: t('factFloorValue', { floor }),
          agrees: agreement.floor,
        },
    record.landSurfaceM2 === null
      ? null
      : {
          label: t('factLand'),
          value: t('addressSurface', {
            surface: format.number(record.landSurfaceM2, {
              maximumFractionDigits: 0,
            }),
          }),
          agrees: false,
        },
    record.yearBuilt === null
      ? null
      : {
          label: t('factYearBuilt'),
          value: String(record.yearBuilt),
          agrees: agreement.yearBuilt,
        },
    record.heatingEnergy === null
      ? null
      : {
          label: t('factHeating'),
          value: t(HEATING_KEY[record.heatingEnergy]),
          agrees: agreement.heatingEnergy,
        },
    date === null
      ? null
      : {
          label: t('factDpeDate'),
          value: format.dateTime(date.date, {
            dateStyle: 'long',
            timeZone: 'UTC',
          }),
          agrees: date.agrees,
        },
  ].filter((fact) => fact !== null);

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-4 p-4" style={scoreStyle(score)}>
        <div className="flex items-center gap-2">
          <Badge className="size-7 rounded-full bg-(--score) p-0 text-[13px] font-semibold text-white tabular-nums">
            {rank}
          </Badge>
          <span className="text-[20px] font-semibold tabular-nums text-(--score)">
            {t.rich('addressScore', {
              score,
              muted: (chunks) => (
                <span className="text-[12px] font-medium text-muted-foreground">
                  {chunks}
                </span>
              ),
            })}
          </span>
          <span className="text-[12px] text-muted-foreground">
            {t('detailScoreLabel')}
          </span>
          <span className="sr-only">
            {t(SCORE_LABEL_KEY[scoreBand(score)])}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.18px] text-ink">
              {streetLine(record)}
            </h2>
            {place !== null && (
              <p className="mt-0.5 text-[14px] text-graphite">{place}</p>
            )}
            <p
              role="status"
              className={cn(
                'text-[12px]',
                copyStatus !== 'idle' && 'mt-1',
                copyStatus === 'failed' ? 'text-destructive' : 'text-graphite',
              )}
            >
              {copyStatus === 'copied'
                ? t('detailCopied')
                : copyStatus === 'failed'
                  ? t('detailCopyFailed')
                  : null}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t('detailCopy')}
                  onClick={copy}
                />
              }
            >
              {copyStatus === 'copied' ? <Check /> : <Copy />}
            </TooltipTrigger>
            <TooltipContent>{t('detailCopy')}</TooltipContent>
          </Tooltip>
        </div>
        {(record.dpeClass !== null || record.gesClass !== null) && (
          <div className="flex items-center gap-2">
            {record.dpeClass !== null && (
              <EnergyBadge label="dpe" letter={record.dpeClass} />
            )}
            {record.gesClass !== null && (
              <EnergyBadge label="ges" letter={record.gesClass} />
            )}
          </div>
        )}
        {facts.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {facts.map((fact) => (
              <Card
                key={fact.label}
                size="sm"
                // why: the primitive's data-[size=sm] spacing outranks a plain override
                className="gap-0 py-2.5 data-[size=sm]:gap-0 data-[size=sm]:py-2.5"
              >
                <CardContent className="flex flex-col">
                  <p className="text-[11px] text-muted-foreground">
                    {fact.label}
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium text-ink">
                    {fact.value}
                  </p>
                  {fact.agrees && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-graphite">
                      <Check className="size-3 shrink-0" aria-hidden />
                      {t('detailFactAgrees')}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <VerifyElsewhere record={record} />
      </div>
    </ScrollArea>
  );
}
