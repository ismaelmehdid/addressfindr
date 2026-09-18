'use client';

import { FileText, FileType2 } from 'lucide-react';
import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FileTileActions } from './file-tile-actions';
import { InlinePreview } from './inline-preview/inline-preview';

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
  file: FileRow;
  signedUrl: string | null;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function FileTileImpl({
  file,
  signedUrl,
  onOpen,
  onDownload,
  onRename,
  onDelete,
}: Props) {
  const showBadge =
    file.indexStatus === 'pending' ||
    file.indexStatus === 'indexing' ||
    file.indexStatus === 'error';

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-stone bg-paper transition-all duration-200',
        'hover:border-charcoal/40 hover:shadow-md',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col text-left outline-none"
        aria-label={file.originalName}
      >
        <div className="relative flex w-full shrink-0 items-center justify-center overflow-hidden bg-linen aspect-[595/842]">
          <InlinePreview file={file} signedUrl={signedUrl} />
          {showBadge && (
            <div className="absolute top-2 left-2">
              <Badge
                variant={
                  file.indexStatus === 'error' ? 'destructive' : 'outline'
                }
                className="text-[10px]"
              >
                {file.indexStatus}
              </Badge>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 border-t border-stone p-3">
          <span className="truncate text-xs font-semibold text-ink">
            {file.originalName}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {file.fileType === 'pdf' || file.fileType === 'docx' ? (
              <FileText className="size-3 shrink-0" />
            ) : (
              <FileType2 className="size-3 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate uppercase">
              {file.fileType}
            </span>
            <span className="shrink-0">{formatDate(file.createdAt)}</span>
          </div>
        </div>
      </button>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
        <FileTileActions
          onOpen={onOpen}
          onDownload={onDownload}
          onRename={onRename}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

export const FileTile = memo(FileTileImpl);
