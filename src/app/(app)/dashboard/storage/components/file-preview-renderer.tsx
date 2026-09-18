'use client';

import { CsvInlinePreview } from './inline-preview/csv-inline-preview';
import { DocxInlinePreview } from './inline-preview/docx-inline-preview';
import { ImageInlinePreview } from './inline-preview/image-inline-preview';
import { JsonInlinePreview } from './inline-preview/json-inline-preview';
import { TextInlinePreview } from './inline-preview/text-inline-preview';

type Props = {
  fileType: string;
  fileName: string;
  signedUrl: string;
  unavailableLabel: string;
};

export function FilePreviewRenderer({
  fileType,
  fileName,
  signedUrl,
  unavailableLabel,
}: Props) {
  switch (fileType) {
    case 'pdf':
      return (
        <iframe
          src={signedUrl}
          title={fileName}
          className="h-full w-full border-0"
        />
      );
    case 'docx':
      return (
        <div className="h-full w-full overflow-auto">
          <DocxInlinePreview
            signedUrl={signedUrl}
            fileName={fileName}
            fileType={fileType}
            full
          />
        </div>
      );
    case 'png':
    case 'jpeg':
    case 'webp':
      return (
        <div className="h-full w-full overflow-auto p-4">
          <ImageInlinePreview signedUrl={signedUrl} alt={fileName} />
        </div>
      );
    case 'txt':
      return (
        <div className="h-full w-full overflow-auto">
          <TextInlinePreview signedUrl={signedUrl} />
        </div>
      );
    case 'json':
      return (
        <div className="h-full w-full overflow-auto">
          <JsonInlinePreview signedUrl={signedUrl} />
        </div>
      );
    case 'csv':
      return (
        <div className="h-full w-full overflow-auto">
          <CsvInlinePreview signedUrl={signedUrl} />
        </div>
      );
    default:
      return (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          {unavailableLabel}
        </div>
      );
  }
}
