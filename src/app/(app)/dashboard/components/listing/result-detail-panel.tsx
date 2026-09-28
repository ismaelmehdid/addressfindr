'use client';

import {
  ArrowUpRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Landmark,
  MapPin,
  TriangleAlert,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  factAgreement,
  placeLine,
  reliableFloor,
  shownDpeDate,
  streetLine,
} from '@/core/ademe/record-facts';
import type { AddressCandidate } from '@/core/ademe/types';
import {
  dvfSalesUrl,
  georisquesReportUrl,
  googleMapsUrl,
  villedereveCommuneUrl,
} from '@/core/geo/outbound-links';
import type {
  EnergyClass,
  ExtractedValues,
  HeatingEnergy,
} from '@/core/listing/types';
import {
  streetViewImagePath,
  streetViewPanoramaUrl,
} from '@/core/street-view/links';

// why: the official DPE and GES label colours encode the letter itself; they
// are the one deliberate exception to the single accent colour.
const DPE_COLOUR = {
  A: '#319834',
  B: '#33CC31',
  C: '#CBFC34',
  D: '#FBFE06',
  E: '#FBCC05',
  F: '#FC9935',
  G: '#FC0205',
} as const satisfies Record<EnergyClass, string>;

const GES_COLOUR = {
  A: '#F6EDFD',
  B: '#E4C7FA',
  C: '#D5AAF6',
  D: '#CB95F3',
  E: '#BA72EF',
  F: '#A74DEB',
  G: '#8A19DF',
} as const satisfies Record<EnergyClass, string>;

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

type OutboundLink = {
  href: string;
  title: string;
  hint: string;
  icon: typeof MapPin;
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

async function copied(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ResultDetailPanel({
  candidate,
  rank,
  onPrevious,
  onNext,
  onClose,
  streetViewEnabled,
  listing,
}: {
  candidate: AddressCandidate;
  rank: number;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  streetViewEnabled: boolean;
  listing: DetailListing;
}) {
  const t = useTranslations('Listing');

  // why: the header (and its pager/close buttons) stays mounted across a
  // selection change, so keyboard focus on one of its buttons survives
  // "Adresse suivante"/"précédente" instead of dropping to <body>. Only the
  // body below, keyed on the shown result, resets its own state.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-[13px] font-semibold text-ink">
          {t('detailTitle', { rank })}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('addressPrevious')}
            disabled={onPrevious === null}
            focusableWhenDisabled
            onClick={() => {
              onPrevious?.();
            }}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('addressNext')}
            disabled={onNext === null}
            focusableWhenDisabled
            onClick={() => {
              onNext?.();
            }}
          >
            <ChevronRight />
          </Button>
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
      <ResultDetailBody
        key={candidate.record.dpeNumber}
        candidate={candidate}
        rank={rank}
        streetViewEnabled={streetViewEnabled}
        listing={listing}
      />
    </div>
  );
}

function ResultDetailBody({
  candidate,
  rank,
  streetViewEnabled,
  listing,
}: {
  candidate: AddressCandidate;
  rank: number;
  streetViewEnabled: boolean;
  listing: DetailListing;
}) {
  const t = useTranslations('Listing');
  const format = useFormatter();
  const [photoFailed, setPhotoFailed] = useState(false);
  const { record } = candidate;
  const { point } = record;
  const score = Math.round(candidate.confidence * 100);
  const place = placeLine(record);
  const floor = reliableFloor(record);
  const date = shownDpeDate(record, listing.dpeDate);
  const agreement = factAgreement(record, listing);

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
    floor === null
      ? null
      : {
          label: t('factFloor'),
          value: t('factFloorValue', { floor }),
          agrees: agreement.floor,
        },
  ].filter((fact) => fact !== null);

  const links: OutboundLink[] =
    point === null
      ? []
      : [
          {
            href: googleMapsUrl(point),
            title: t('linkGoogleMaps'),
            hint: t('linkGoogleMapsHint'),
            icon: MapPin,
          },
          {
            href: georisquesReportUrl({
              point,
              inseeCode: record.inseeCode,
              address: record.address,
              city: record.city,
            }),
            title: t('linkGeorisques'),
            hint: t('linkGeorisquesHint'),
            icon: TriangleAlert,
          },
          {
            href: dvfSalesUrl({ point, inseeCode: record.inseeCode }),
            title: t('linkDvf'),
            hint: t('linkDvfHint'),
            icon: Landmark,
          },
          {
            href: villedereveCommuneUrl(record.inseeCode),
            title: t('linkVilledereve'),
            hint: t('linkVilledereveHint'),
            icon: Building2,
          },
        ].filter((link): link is OutboundLink => link.href !== null);

  return (
    <ScrollArea className="min-h-0 flex-1">
      {streetViewEnabled && point !== null && !photoFailed && (
        <a
          href={streetViewPanoramaUrl(point)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('detailStreetViewOpen')}
          className="relative block aspect-[2/1]"
        >
          <Skeleton className="absolute inset-0 rounded-none" />
          <Image
            unoptimized
            fill
            sizes="420px"
            src={streetViewImagePath(point)}
            alt={t('streetViewAlt', { address: record.address })}
            onError={() => {
              setPhotoFailed(true);
            }}
            className="object-cover"
          />
          <Badge variant="secondary" className="absolute bottom-2.5 left-2.5">
            {t('streetViewBadge')}
          </Badge>
        </a>
      )}
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <Badge>{rank}</Badge>
          <span className="text-[20px] font-semibold tabular-nums text-ink">
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
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[20px] font-semibold leading-tight tracking-[-0.18px] text-ink">
              {streetLine(record)}
            </p>
            {place !== null && (
              <p className="mt-0.5 text-[14px] text-graphite">{place}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('detailCopy')}
            onClick={() => {
              void copied(record.address).then((ok) => {
                if (ok) toast.success(t('detailCopied'));
                else toast.error(t('detailCopyFailed'));
              });
            }}
          >
            <Copy />
          </Button>
        </div>
        {(record.dpeClass !== null || record.gesClass !== null) && (
          <div className="flex items-center gap-2">
            {record.dpeClass !== null && (
              <Badge variant="outline">
                <span
                  aria-hidden
                  className="size-2 rounded-full ring-1 ring-foreground/15"
                  style={{ backgroundColor: DPE_COLOUR[record.dpeClass] }}
                />
                {t('detailDpe', { letter: record.dpeClass })}
              </Badge>
            )}
            {record.gesClass !== null && (
              <Badge variant="outline">
                <span
                  aria-hidden
                  className="size-2 rounded-full ring-1 ring-foreground/15"
                  style={{ backgroundColor: GES_COLOUR[record.gesClass] }}
                />
                {t('detailGes', { letter: record.gesClass })}
              </Badge>
            )}
          </div>
        )}
        {facts.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {facts.map((fact) => (
              <Card key={fact.label} size="sm" className="gap-0 py-2.5">
                <CardContent className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">
                      {fact.label}
                    </p>
                    <p className="mt-0.5 text-[14px] font-medium text-ink">
                      {fact.value}
                    </p>
                  </div>
                  {fact.agrees && (
                    <span className="shrink-0 text-ink">
                      <Check className="size-3.5" aria-hidden />
                      <span className="sr-only">{t('detailFactAgrees')}</span>
                    </span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {links.length > 0 && (
          <>
            <Separator />
            <section className="flex flex-col gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-graphite">
                {t('verifyElsewhere')}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {links.map((link) => (
                  <a
                    key={link.title}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({
                      variant: 'outline',
                      className:
                        'h-auto justify-start gap-2.5 whitespace-normal px-3 py-2.5 text-left',
                    })}
                  >
                    <link.icon className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">
                        {link.title}
                      </span>
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {link.hint}
                      </span>
                    </span>
                    <ArrowUpRight
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </a>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
