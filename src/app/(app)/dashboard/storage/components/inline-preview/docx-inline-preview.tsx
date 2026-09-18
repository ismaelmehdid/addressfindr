'use client';

import { Loader2 } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { FileFallbackCard } from './file-fallback-card';

type Props = {
  signedUrl: string;
  fileName: string;
  fileType: string;
  full?: boolean;
};

function DocxInlinePreviewImpl({ signedUrl, fileName, fileType, full }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fitToWidth = useCallback(() => {
    if (!full) return;
    const wrapper = wrapperRef.current;
    const container = containerRef.current;
    if (!wrapper || !container) return;
    const page = container.querySelector<HTMLElement>('section.docx');
    if (!page) return;
    const available = wrapper.clientWidth - 48;
    const natural = page.scrollWidth || page.offsetWidth;
    if (!natural || available <= 0) return;
    const factor = Math.min(1, available / natural);
    container.style.setProperty('zoom', String(factor));
  }, [full]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(false);
    el.innerHTML = '';

    (async () => {
      try {
        const [{ renderAsync }, response] = await Promise.all([
          import('docx-preview'),
          fetch(signedUrl, { signal: controller.signal }),
        ]);
        if (!response.ok) throw new Error('fetch failed');
        const blob = await response.blob();
        if (cancelled) return;
        await renderAsync(blob, el, undefined, {
          className: 'docx-preview',
          inWrapper: true,
          ignoreWidth: true,
          ignoreHeight: true,
        });
        if (!cancelled) {
          setLoading(false);
          requestAnimationFrame(fitToWidth);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      cancelled = true;
    };
  }, [signedUrl, fitToWidth]);

  useEffect(() => {
    if (!full) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => fitToWidth());
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [full, fitToWidth]);

  if (error) {
    return <FileFallbackCard label={fileName} fileExtension={fileType} />;
  }

  if (full) {
    return (
      <div ref={wrapperRef} className="relative w-full">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-linen">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
        <div
          ref={containerRef}
          className="flex justify-center py-6 [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-0"
        />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-linen">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <div
        ref={containerRef}
        className={cn(
          'origin-top-left scale-[0.4] [&_.docx-wrapper]:p-0 [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper>section.docx]:shadow-none [&_.docx-wrapper>section.docx]:m-0',
        )}
        style={{ width: '250%', height: '250%' }}
      />
    </div>
  );
}

export const DocxInlinePreview = memo(DocxInlinePreviewImpl);
