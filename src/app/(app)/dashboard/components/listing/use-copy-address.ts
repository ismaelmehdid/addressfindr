'use client';

import { useEffect, useState } from 'react';

export type CopyStatus = 'idle' | 'copied' | 'failed';

const COPIED_FOR_MS = 2000;

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function useCopyAddress(address: string): {
  status: CopyStatus;
  copy: () => void;
} {
  const [status, setStatus] = useState<CopyStatus>('idle');

  useEffect(() => {
    if (status !== 'copied') return;
    const timer = window.setTimeout(() => {
      setStatus('idle');
    }, COPIED_FOR_MS);
    return (): void => {
      window.clearTimeout(timer);
    };
  }, [status]);

  function copy(): void {
    void writeToClipboard(address).then((ok) => {
      setStatus(ok ? 'copied' : 'failed');
    });
  }

  return { status, copy };
}
