'use client';

import { ExternalLink } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { listingDisplayUrl } from '@/core/listing/listing-summary';
import type { ExtractedListing } from '@/core/listing/types';

export function AnalysedListingCard({
  listing,
}: {
  listing: ExtractedListing;
}) {
  const t = useTranslations('Listing');
  const format = useFormatter();
  const { fields } = listing;

  const type =
    fields.propertyType === 'apartment'
      ? t('addressPropertyApartment')
      : fields.propertyType === 'house'
        ? t('addressPropertyHouse')
        : null;
  const rooms =
    fields.rooms === null ? null : t('listingRooms', { count: fields.rooms });
  const surface =
    fields.surfaceM2 === null
      ? null
      : t('addressSurface', {
          surface: format.number(fields.surfaceM2, {
            maximumFractionDigits: 1,
          }),
        });
  // why: this is the listing's own floor, read from the page; unlike ADEME's
  // default 0, a 0 here is a real ground floor.
  const floor =
    fields.floor === null
      ? null
      : fields.floor === 0
        ? t('listingFloorGround')
        : t('addressFloor', { floor: fields.floor });
  const place =
    fields.city === null
      ? null
      : fields.postalCode === null
        ? fields.city
        : t('listingPlace', {
            city: fields.city,
            postalCode: fields.postalCode,
          });
  const title = [type, rooms, surface]
    .filter((part) => part !== null)
    .join(' ');
  const facts = [
    type,
    surface,
    floor,
    fields.yearBuilt === null
      ? null
      : t('addressYearBuilt', { year: String(fields.yearBuilt) }),
    place,
  ].filter((fact) => fact !== null);
  const displayUrl =
    listingDisplayUrl(fields.canonicalUrl) ?? fields.canonicalUrl;

  return (
    <a
      href={fields.canonicalUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={t('listingOpenTitle', { url: displayUrl })}
      className="group/listing block rounded-xl"
    >
      <Card
        size="sm"
        className="transition-colors group-hover/listing:bg-mist/60"
      >
        <CardHeader>
          <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.06em]">
            {t('listingAnalysedLabel')}
          </CardDescription>
          <CardTitle className="text-[15px] font-semibold group-data-[size=sm]/card:text-[15px]">
            {title.length > 0 ? title : t('listingUntitled')}
          </CardTitle>
          <CardAction>
            <ExternalLink
              aria-hidden
              className="size-4 text-muted-foreground transition-colors group-hover/listing:text-ink"
            />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {facts.length > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {facts.join(' · ')}
            </p>
          )}
          <p className="truncate text-[12px] text-muted-foreground underline-offset-2 group-hover/listing:underline">
            {displayUrl}
            <span className="sr-only"> {t('listingNewTab')}</span>
          </p>
        </CardContent>
      </Card>
    </a>
  );
}
