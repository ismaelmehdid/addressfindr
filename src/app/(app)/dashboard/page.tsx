import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { env } from '@/shared/env';
import { ListingUrlForm } from './components/listing/listing-url-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return { title: t('dashboard') };
}

export default function DashboardHomePage(): React.ReactElement {
  return (
    <ListingUrlForm
      mapboxAccessToken={env().NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ''}
    />
  );
}
