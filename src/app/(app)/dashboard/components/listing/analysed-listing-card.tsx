'use client';

import { ExternalLink } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
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
    fields.yearBuilt === null
      ? null
      : t('addressYearBuilt', { year: String(fields.yearBuilt) }),
    place,
  ].filter((fact) => fact !== null);
  const displayUrl = listingDisplayUrl(fields.canonicalUrl);
  const openLabel = t('listingOpen', {
    host: displayUrl ?? fields.canonicalUrl,
  });

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.06em]">
          {t('listingAnalysedLabel')}
        </CardDescription>
        <CardTitle className="text-[15px] font-semibold">
          {title.length > 0 ? title : t('listingUntitled')}
        </CardTitle>
        <CardAction>
          <a
            href={fields.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={openLabel}
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
          >
            <ExternalLink aria-hidden />
          </a>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {facts.length > 0 && (
          <p className="text-[13px] text-muted-foreground">
            {facts.join(' · ')}
          </p>
        )}
        {displayUrl !== null && (
          <a
            href={fields.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {displayUrl}
          </a>
        )}
      </CardContent>
    </Card>
  );
}
