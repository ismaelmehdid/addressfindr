'use client';

import { useTranslations } from 'next-intl';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { type MapView, pickedMapView } from './map-view';

const OPTION_CLASS =
  'h-7 rounded-xl px-2.5 text-xs font-semibold text-muted-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground lg:h-8 lg:px-3 lg:text-[13px]';

export function MapViewSwitch({
  view,
  onViewChange,
  className,
}: {
  view: MapView;
  onViewChange: (view: MapView) => void;
  className?: string;
}) {
  const t = useTranslations('Listing');

  return (
    <ToggleGroup
      aria-label={t('mapViewLabel')}
      value={[view]}
      onValueChange={(values) => {
        const picked = pickedMapView(values);
        if (picked !== null) onViewChange(picked);
      }}
      spacing={1}
      className={cn(
        'rounded-3xl border border-border bg-paper p-[3px] shadow-sm',
        className,
      )}
    >
      <ToggleGroupItem value="map" className={OPTION_CLASS}>
        {t('mapViewMap')}
      </ToggleGroupItem>
      <ToggleGroupItem value="satellite" className={OPTION_CLASS}>
        {t('mapViewSatellite')}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
