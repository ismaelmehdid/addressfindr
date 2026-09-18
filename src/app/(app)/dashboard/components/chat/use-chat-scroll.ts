'use client';

import type { UIMessage } from 'ai';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

const LOAD_OLDER_TRIGGER_DISTANCE_PX = 200;
const NEAR_BOTTOM_THRESHOLD_PX = 80;

type Params = {
  conversationId: string | null;
  messages: UIMessage[];
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadOlder: () => void;
};

type Return = {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  scrollToBottom: () => void;
};

export function useChatScroll({
  conversationId,
  messages,
  hasMore,
  isFetchingMore,
  onLoadOlder,
}: Params): Return {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const prevConversationIdRef = useRef<string | null>(null);
  const prevFirstMessageIdRef = useRef<string | null>(null);
  const prevLastMessageIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef<number>(0);

  const onLoadOlderRef = useRef(onLoadOlder);
  const isFetchingMoreRef = useRef(isFetchingMore);
  const hasMoreRef = useRef(hasMore);

  useEffect(() => {
    onLoadOlderRef.current = onLoadOlder;
  }, [onLoadOlder]);

  useEffect(() => {
    isFetchingMoreRef.current = isFetchingMore;
  }, [isFetchingMore]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const scrollToBottom = useCallback((): void => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, []);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const firstId = messages[0]?.id ?? null;
    const lastMessage = messages[messages.length - 1];
    const lastId = lastMessage?.id ?? null;
    const prevConversationId = prevConversationIdRef.current;
    const prevFirstId = prevFirstMessageIdRef.current;
    const prevLastId = prevLastMessageIdRef.current;

    const conversationChanged = prevConversationId !== conversationId;
    const prepended =
      !conversationChanged &&
      prevFirstId !== null &&
      firstId !== null &&
      prevFirstId !== firstId;
    const userSent =
      !conversationChanged &&
      !prepended &&
      lastId !== null &&
      lastId !== prevLastId &&
      lastMessage?.role === 'user';

    if (conversationChanged) {
      if (messages.length > 0) {
        container.scrollTop = container.scrollHeight;
      }
    } else if (prepended) {
      const delta = container.scrollHeight - prevScrollHeightRef.current;
      if (delta > 0) {
        container.scrollTop = container.scrollTop + delta;
      }
    } else if (userSent) {
      container.scrollTop = container.scrollHeight;
    }

    prevConversationIdRef.current = conversationId;
    prevFirstMessageIdRef.current = firstId;
    prevLastMessageIdRef.current = lastId;
    prevScrollHeightRef.current = container.scrollHeight;
  }, [conversationId, messages]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const recomputeAtBottom = (): void => {
      const distance =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setIsAtBottom(distance <= NEAR_BOTTOM_THRESHOLD_PX);
    };

    const onScroll = (): void => {
      recomputeAtBottom();
      if (!hasMoreRef.current) return;
      if (isFetchingMoreRef.current) return;
      if (container.scrollTop > LOAD_OLDER_TRIGGER_DISTANCE_PX) return;
      onLoadOlderRef.current();
    };

    recomputeAtBottom();
    container.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(recomputeAtBottom);
    ro.observe(container);
    return (): void => {
      container.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  return { scrollContainerRef, isAtBottom, scrollToBottom };
}
