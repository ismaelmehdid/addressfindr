import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listFiles } from '@/application/files/list-files';
import { FilesPageContent } from './components/files-page-content';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return { title: t('storage') };
}

export default async function FilesPage(): Promise<React.ReactElement> {
  const result = await listFiles({ page: 0 });
  if (result.isErr()) {
    return (
      <FilesPageContent
        initialItems={[]}
        initialHasMore={false}
        initialPage={0}
      />
    );
  }
  return (
    <FilesPageContent
      initialItems={result.value.items}
      initialHasMore={result.value.hasMore}
      initialPage={result.value.page}
    />
  );
}
