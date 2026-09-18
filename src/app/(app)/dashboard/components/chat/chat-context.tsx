'use client';

import type { UIMessage } from 'ai';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';

type AssistantFinishedListener = (message: UIMessage) => void;

type ChatContextValue = {
  notifyAssistantFinished: (message: UIMessage) => void;
  subscribeToAssistantFinished: (
    listener: AssistantFinishedListener,
  ) => () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef<Set<AssistantFinishedListener>>(new Set());

  const notifyAssistantFinished = useCallback((message: UIMessage) => {
    for (const listener of listenersRef.current) {
      listener(message);
    }
  }, []);

  const subscribeToAssistantFinished = useCallback(
    (listener: AssistantFinishedListener) => {
      listenersRef.current.add(listener);
      return () => {
        listenersRef.current.delete(listener);
      };
    },
    [],
  );

  const value = useMemo(
    () => ({ notifyAssistantFinished, subscribeToAssistantFinished }),
    [notifyAssistantFinished, subscribeToAssistantFinished],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useNotifyAssistantFinished(): (message: UIMessage) => void {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error(
      'useNotifyAssistantFinished must be used within ChatProvider',
    );
  }
  return ctx.notifyAssistantFinished;
}

export function useSubscribeToAssistantFinished(): (
  listener: AssistantFinishedListener,
) => () => void {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error(
      'useSubscribeToAssistantFinished must be used within ChatProvider',
    );
  }
  return ctx.subscribeToAssistantFinished;
}
