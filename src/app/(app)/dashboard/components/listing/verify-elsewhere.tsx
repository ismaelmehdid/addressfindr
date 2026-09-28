'use client';

import {
  ArrowUpRight,
  Building2,
  Landmark,
  type LucideIcon,
  MapPin,
  TriangleAlert,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { DpeRecord } from '@/core/ademe/types';
import {
  dvfSalesUrl,
  georisquesReportUrl,
  googleMapsUrl,
  villedereveCommuneUrl,
} from '@/core/geo/outbound-links';
import { cn } from '@/lib/utils';

type OutboundLink = {
  href: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  hue: string;
};

// why: one muted hue per destination tells the four tiles apart at a glance.
// Like the DPE colours they identify rather than act, so they sit outside the
// single accent colour of DESIGN.md.
const LINK_HUE = {
  googleMaps: '#4f6d99',
  georisques: '#b06e4e',
  dvf: '#3a7480',
  villedereve: '#74629b',
};

// why: every link is built from the trusted point or the commune code, never
// from the address text alone, so a result without a trusted point has none.
export function VerifyElsewhere({
  record,
}: {
  record: Pick<DpeRecord, 'point' | 'inseeCode' | 'address' | 'city'>;
}) {
  const t = useTranslations('Listing');
  const { point } = record;
  if (point === null) return null;

  const links = [
    {
      href: googleMapsUrl(point),
      title: t('linkGoogleMaps'),
      hint: t('linkGoogleMapsHint'),
      icon: MapPin,
      hue: LINK_HUE.googleMaps,
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
      hue: LINK_HUE.georisques,
    },
    {
      href: dvfSalesUrl({ point, inseeCode: record.inseeCode }),
      title: t('linkDvf'),
      hint: t('linkDvfHint'),
      icon: Landmark,
      hue: LINK_HUE.dvf,
    },
    {
      href: villedereveCommuneUrl(record.inseeCode),
      title: t('linkVilledereve'),
      hint: t('linkVilledereveHint'),
      icon: Building2,
      hue: LINK_HUE.villedereve,
    },
  ].filter((link): link is OutboundLink => link.href !== null);

  return (
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
              // why: cn merges the overrides into the variant's own h-7, gap
              // and whitespace-nowrap, which would otherwise win in the CSS.
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'h-auto justify-start gap-2.5 whitespace-normal px-2.5 py-2.5 text-left',
              )}
            >
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-white"
                style={{ backgroundColor: link.hue }}
              >
                <link.icon className="size-4" />
              </span>
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
  );
}
