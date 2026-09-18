'use client';

import { FileText } from 'lucide-react';
import { memo } from 'react';

type Props = {
  label: string;
  fileExtension?: string;
};

function FileFallbackCardImpl({ label, fileExtension }: Props) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-linen p-4">
      <FileText className="size-8 text-muted-foreground" />
      <div className="flex max-w-full flex-col items-center gap-1 text-center">
        <span className="line-clamp-2 text-[11px] font-medium text-ink">
          {label}
        </span>
        {fileExtension && (
          <span className="rounded bg-paper px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
            {fileExtension}
          </span>
        )}
      </div>
    </div>
  );
}

export const FileFallbackCard = memo(FileFallbackCardImpl);
