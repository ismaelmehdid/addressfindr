'use client';

import { Loader2 } from 'lucide-react';
import { memo, useEffect, useState } from 'react';

const SAMPLE_CHARS = 2000;

type Props = {
  signedUrl: string;
};

type LoadedState = { url: string; text: string };

function JsonInlinePreviewImpl({ signedUrl }: Props) {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetch(signedUrl, { signal: controller.signal })
      .then((r) => (r.ok ? r.text() : ''))
      .then((body) => {
        if (cancelled) return;
        let text: string;
        try {
          const parsed = JSON.parse(body);
          text = JSON.stringify(parsed, null, 2).slice(0, SAMPLE_CHARS);
        } catch {
          text = body.slice(0, SAMPLE_CHARS);
        }
        setLoaded({ url: signedUrl, text });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (!cancelled) setLoaded({ url: signedUrl, text: '' });
      });
    return () => {
      controller.abort();
      cancelled = true;
    };
  }, [signedUrl]);

  const isLoading = loaded === null || loaded.url !== signedUrl;
  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <pre className="h-full w-full overflow-hidden whitespace-pre break-words p-3 font-mono text-[10px] leading-snug text-ink">
      {loaded.text}
    </pre>
  );
}

export const JsonInlinePreview = memo(JsonInlinePreviewImpl);
