'use client';

import { Loader2 } from 'lucide-react';
import { memo } from 'react';
import { CsvInlinePreview } from './csv-inline-preview';
import { DocxInlinePreview } from './docx-inline-preview';
import { FileFallbackCard } from './file-fallback-card';
import { ImageInlinePreview } from './image-inline-preview';
import { JsonInlinePreview } from './json-inline-preview';
import { PdfInlinePreview } from './pdf-inline-preview';
import { TextInlinePreview } from './text-inline-preview';
import { useInView } from './use-in-view';

type FileRow = {
  id: string;
  originalName: string;
  fileType: string;
};

type Props = {
  file: FileRow;
  signedUrl: string | null;
};

function InlinePreviewImpl({ file, signedUrl }: Props) {
  const { ref, inView } = useInView<HTMLDivElement>();

  if (!signedUrl) {
    return (
      <div ref={ref} className="flex h-full w-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!inView) {
    return (
      <div ref={ref} className="flex h-full w-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  switch (file.fileType) {
    case 'pdf':
      return (
        <PdfInlinePreview
          signedUrl={signedUrl}
          fileName={file.originalName}
          fileType={file.fileType}
        />
      );
    case 'docx':
      return (
        <DocxInlinePreview
          signedUrl={signedUrl}
          fileName={file.originalName}
          fileType={file.fileType}
        />
      );
    case 'png':
    case 'jpeg':
    case 'webp':
      return (
        <ImageInlinePreview signedUrl={signedUrl} alt={file.originalName} />
      );
    case 'txt':
      return <TextInlinePreview signedUrl={signedUrl} />;
    case 'json':
      return <JsonInlinePreview signedUrl={signedUrl} />;
    case 'csv':
      return <CsvInlinePreview signedUrl={signedUrl} />;
    default:
      return (
        <FileFallbackCard
          label={file.originalName}
          fileExtension={file.fileType}
        />
      );
  }
}

export const InlinePreview = memo(InlinePreviewImpl);
