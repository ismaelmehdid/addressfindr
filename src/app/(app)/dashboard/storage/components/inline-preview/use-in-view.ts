'use client';

import { useEffect, useRef, useState } from 'react';

export function useInView<T extends Element>(
  options?: IntersectionObserverInit,
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inView) return;
    const observer = new IntersectionObserver((entries): void => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
          return;
        }
      }
    }, options ?? { rootMargin: '200px', threshold: 0 });
    observer.observe(el);
    return (): void => observer.disconnect();
  }, [inView, options]);

  return { ref, inView };
}
