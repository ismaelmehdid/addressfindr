import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getFile } from '@/application/files/get-file';
import { FilePreviewPage } from './components/file-preview-page';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return { title: t('storage') };
}

export default async function StorageFilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const result = await getFile(id);
  if (result.isErr()) notFound();
  const f = result.value;
  return (
    <FilePreviewPage
      file={{
        id: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        fileType: f.fileType,
        sizeBytes: f.sizeBytes,
        createdAt: f.createdAt,
      }}
    />
  );
}
