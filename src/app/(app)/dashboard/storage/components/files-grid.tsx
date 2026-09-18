'use client';

import { FileText, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/empty-state';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { FileTile } from './file-tile';

type FileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  fileType: string;
  sizeBytes: number;
  status: string;
  indexStatus: string;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  items: FileRow[];
  signedUrls: Record<string, string>;
  hasMore: boolean;
  fetchingMore: boolean;
  onEndReached: () => void;
  onOpen: (file: FileRow) => void;
  onDownload: (file: FileRow) => void;
  onRename: (file: FileRow) => void;
  onDelete: (file: FileRow) => void;
};

export function FilesGrid({
  items,
  signedUrls,
  hasMore,
  fetchingMore,
  onEndReached,
  onOpen,
  onDownload,
  onRename,
  onDelete,
}: Props) {
  const t = useTranslations('Storage');
  const { scrollContainerRef } = useInfiniteScroll({
    onEndReached: hasMore ? onEndReached : undefined,
    isFetchingMore: fetchingMore,
    threshold: 200,
  });

  if (items.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={t('empty')}
        description={t('emptyDescription')}
      />
    );
  }

  return (
    <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto">
      <div className="grid gap-4 p-4 grid-cols-[repeat(auto-fill,minmax(max(160px,calc((100%-2*1rem)/3)),1fr))]">
        {items.map((file) => (
          <FileTile
            key={file.id}
            file={file}
            signedUrl={signedUrls[file.id] ?? null}
            onOpen={() => onOpen(file)}
            onDownload={() => onDownload(file)}
            onRename={() => onRename(file)}
            onDelete={() => onDelete(file)}
          />
        ))}
      </div>
      {fetchingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
