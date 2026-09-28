'use client';

import {
  Building2,
  CalendarDays,
  DoorOpen,
  ExternalLink,
  House,
  LandPlot,
  Layers,
  type LucideIcon,
  MapPin,
  Ruler,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
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
import { ListingPortalIcon } from './listing-portal-icon';

type ListingChip = { id: string; icon: LucideIcon; label: string };

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
  const land =
    fields.landSurfaceM2 === null
      ? null
      : t('addressLand', {
          surface: format.number(fields.landSurfaceM2, {
            maximumFractionDigits: 0,
          }),
        });
  const yearBuilt =
    fields.yearBuilt === null
      ? null
      : t('addressYearBuilt', { year: String(fields.yearBuilt) });
  const chips: ListingChip[] = [
    type === null
      ? null
      : {
          id: 'type',
          icon: fields.propertyType === 'house' ? House : Building2,
          label: type,
        },
    rooms === null ? null : { id: 'rooms', icon: DoorOpen, label: rooms },
    surface === null ? null : { id: 'surface', icon: Ruler, label: surface },
    land === null ? null : { id: 'land', icon: LandPlot, label: land },
    floor === null ? null : { id: 'floor', icon: Layers, label: floor },
    yearBuilt === null
      ? null
      : { id: 'year-built', icon: CalendarDays, label: yearBuilt },
    place === null ? null : { id: 'place', icon: MapPin, label: place },
  ].filter((chip) => chip !== null);
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
          {chips.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {chips.map(({ id, icon: Icon, label }) => (
                <li key={id} className="min-w-0 max-w-full">
                  <Badge
                    variant="secondary"
                    className="max-w-full text-graphite"
                  >
                    <Icon aria-hidden data-icon="inline-start" />
                    <span className="truncate">{label}</span>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <ListingPortalIcon portal={fields.portal} />
            <span className="min-w-0 truncate underline-offset-2 group-hover/listing:underline">
              {displayUrl}
              <span className="sr-only"> {t('listingNewTab')}</span>
            </span>
          </p>
        </CardContent>
      </Card>
    </a>
  );
}
