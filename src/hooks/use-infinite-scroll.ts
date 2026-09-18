'use client';

import { useCallback, useEffect, useRef } from 'react';

type UseInfiniteScrollParams = {
  onEndReached?: () => void;
  isFetchingMore?: boolean;
  threshold?: number;
};

type UseInfiniteScrollReturn = {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
};

export function useInfiniteScroll({
  onEndReached,
  isFetchingMore,
  threshold = 100,
}: UseInfiniteScrollParams): UseInfiniteScrollReturn {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isFetchingMoreRef = useRef(false);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    const wasFetching = isFetchingMoreRef.current;
    isFetchingMoreRef.current = Boolean(isFetchingMore);

    if (wasFetching && !isFetchingMore) {
      hasTriggeredRef.current = false;
    }
  }, [isFetchingMore]);

  const maybeTriggerEndReached = useCallback((): void => {
    const container = scrollContainerRef.current;
    if (
      !container ||
      !onEndReached ||
      isFetchingMoreRef.current ||
      hasTriggeredRef.current
    ) {
      return;
    }

    const { scrollTop, clientHeight, scrollHeight } = container;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceToBottom <= threshold) {
      hasTriggeredRef.current = true;
      onEndReached();
    }
  }, [onEndReached, threshold]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !onEndReached) {
      return;
    }

    let ticking = false;
    const handleScroll = (): void => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        maybeTriggerEndReached();
        ticking = false;
      });
    };

    container.addEventListener('scroll', handleScroll);
    return (): void => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [maybeTriggerEndReached, onEndReached]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent): void => {
      if (e.deltaX !== 0 && container.scrollWidth > container.clientWidth) {
        const isScrollingLeft = e.deltaX < 0;
        const isScrollingRight = e.deltaX > 0;
        const isAtLeftEdge = container.scrollLeft <= 0;
        const isAtRightEdge =
          container.scrollLeft >= container.scrollWidth - container.clientWidth;

        if (
          (isScrollingLeft && isAtLeftEdge) ||
          (isScrollingRight && isAtRightEdge)
        ) {
          e.preventDefault();
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return (): void => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return { scrollContainerRef };
}
