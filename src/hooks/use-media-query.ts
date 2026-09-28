'use client';

import { useCallback, useSyncExternalStore } from 'react';

function serverSnapshot(): boolean {
  return false;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return (): void => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const snapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
