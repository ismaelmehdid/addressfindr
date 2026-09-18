'use client';

import { useEffect, useState } from 'react';

const PDF_WORKER_SRC =
  '//unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs';
let pdfWorkerConfigured = false;

type ReactPdfModules = {
  Document: typeof import('react-pdf')['Document'];
  Page: typeof import('react-pdf')['Page'];
};

export function useReactPdf(): ReactPdfModules | null {
  const [modules, setModules] = useState<ReactPdfModules | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('react-pdf').then((mod) => {
      if (cancelled) return;
      if (!pdfWorkerConfigured) {
        mod.pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
        pdfWorkerConfigured = true;
      }
      setModules({ Document: mod.Document, Page: mod.Page });
    });
    return (): void => {
      cancelled = true;
    };
  }, []);

  return modules;
}
