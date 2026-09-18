'use client';

import { useCallback, useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export function useLocalStorage<T>(
  key: string,
  initial: T,
): [T, (value: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key),
    () => null,
  );

  let value: T = initial;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = initial;
    }
  }

  const set = useCallback(
    (next: T) => {
      window.localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new StorageEvent('storage', { key }));
    },
    [key],
  );

  return [value, set];
}
