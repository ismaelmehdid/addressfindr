/** biome-ignore-all lint/suspicious/noArrayIndexKey: CSV preview rows/cells are read-only static display; positions are stable identifiers */
'use client';

import { Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import { memo, useEffect, useState } from 'react';

const PREVIEW_ROWS = 12;

type Props = {
  signedUrl: string;
};

type LoadedState = { url: string; rows: string[][] };

function CsvInlinePreviewImpl({ signedUrl }: Props) {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetch(signedUrl, { signal: controller.signal })
      .then((r) => (r.ok ? r.text() : ''))
      .then((body) => {
        if (cancelled) return;
        const result = Papa.parse<string[]>(body, {
          header: false,
          skipEmptyLines: true,
          preview: PREVIEW_ROWS,
        });
        setLoaded({ url: signedUrl, rows: result.data ?? [] });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (!cancelled) setLoaded({ url: signedUrl, rows: [] });
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

  if (loaded.rows.length === 0) {
    return <div className="h-full w-full bg-linen" />;
  }

  const headers = loaded.rows[0] ?? [];
  const body = loaded.rows.slice(1);

  return (
    <div className="h-full w-full overflow-hidden p-2">
      <table className="w-full table-fixed border-collapse text-[9px]">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={`h:${i}`}
                className="truncate border-b border-stone bg-linen px-1 py-0.5 text-left font-semibold text-ink"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={`r:${ri}`}>
              {row.map((cell, ci) => (
                <td
                  key={`c:${ri}:${ci}`}
                  className="truncate border-b border-stone/50 px-1 py-0.5 text-muted-foreground"
                >
                  {cell ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const CsvInlinePreview = memo(CsvInlinePreviewImpl);
