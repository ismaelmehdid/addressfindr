'use client';

import { Loader2 } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { FileFallbackCard } from './file-fallback-card';
import { useReactPdf } from './use-react-pdf';

type Props = {
  signedUrl: string;
  fileName: string;
  fileType: string;
};

const LOADING = (
  <div className="flex h-full w-full items-center justify-center">
    <Loader2 className="size-4 animate-spin text-muted-foreground" />
  </div>
);

function PdfInlinePreviewImpl({ signedUrl, fileName, fileType }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const reactPdf = useReactPdf();
  const file = useMemo(() => ({ url: signedUrl }), [signedUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return (): void => ro.disconnect();
  }, []);

  const ready = !loadError && reactPdf && containerWidth > 0;
  const errorFallback = (
    <FileFallbackCard label={fileName} fileExtension={fileType} />
  );

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-start justify-center overflow-hidden"
    >
      {ready ? (
        <div className="relative flex h-full w-full min-h-0 overflow-hidden rounded-lg bg-linen p-1">
          <div className="relative h-full w-full overflow-hidden rounded-sm bg-paper">
            <reactPdf.Document
              file={file}
              loading={LOADING}
              error={errorFallback}
              onLoadError={(): void => setLoadError(true)}
            >
              <reactPdf.Page
                pageNumber={1}
                width={containerWidth - 8}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </reactPdf.Document>
          </div>
        </div>
      ) : loadError ? (
        errorFallback
      ) : (
        LOADING
      )}
    </div>
  );
}

export const PdfInlinePreview = memo(PdfInlinePreviewImpl);
