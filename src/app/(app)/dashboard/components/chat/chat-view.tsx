'use client';

import { useChat } from '@ai-sdk/react';
import type { FileUIPart, UIMessage } from 'ai';
import { ArrowDown, PencilLine } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { v7 as uuidv7 } from 'uuid';
import { CHAT_PROVIDER_METADATA_KEY } from '@/application/chat/dto';
import type { MessageCursor } from '@/application/conversation/ports/message-store.port';
import { Button } from '@/components/ui/button';
import {
  MAX_ATTACHMENTS_BYTES_PER_TURN,
  MAX_ATTACHMENTS_PER_TURN,
} from '@/core/chat/attachment-rules';
import { parsePathnameToPageContext } from '@/core/chat/page-context';
import { FilesDropZone } from '../../storage/components/files-drop-zone';
import { type AttachmentDraft, AttachmentTray } from './attachment-tray';
import { useNotifyAssistantFinished } from './chat-context';
import {
  activateConversation,
  clearActiveConversation,
  fetchOlderMessages,
} from './chat-history-api';
import { ChatHistoryPopover } from './chat-history-popover';
import { FloatingInput } from './floating-input';
import { MessagesList } from './messages-list';
import { prependUnique } from './prepend-unique';
import { UploadAttachmentError, uploadAttachment } from './upload-attachment';
import { useActiveContext } from './use-active-context';
import { useChatScroll } from './use-chat-scroll';

type Props = {
  initialConversationId: string | null;
  initialMessages: UIMessage[];
  initialHasMore: boolean;
  initialOldestCursor: MessageCursor | null;
};

type LoadOlderSnapshot = {
  conversationId: string | null;
  hasMore: boolean;
  oldestCursor: MessageCursor | null;
};

export function ChatView({
  initialConversationId,
  initialMessages,
  initialHasMore,
  initialOldestCursor,
}: Props) {
  const t = useTranslations('Home');
  const tErrors = useTranslations('Errors');

  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [input, setInput] = useState('');
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [oldestCursor, setOldestCursor] = useState<MessageCursor | null>(
    initialOldestCursor,
  );
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [isSending, setIsSending] = useState(false);

  const loadOlderSnapshotRef = useRef<LoadOlderSnapshot>({
    conversationId: initialConversationId,
    hasMore: initialHasMore,
    oldestCursor: initialOldestCursor,
  });
  const fetchingRef = useRef(false);

  const notifyAssistantFinished = useNotifyAssistantFinished();
  const pathname = usePathname();

  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    generateId: () => uuidv7(),
    messages: initialMessages,
    onError: () => {
      toast.error(tErrors('description'));
    },
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      if (isAbort || isDisconnect || isError) return;
      if (message.role !== 'assistant') return;
      notifyAssistantFinished(message);
    },
  });

  useEffect(() => {
    loadOlderSnapshotRef.current = { conversationId, hasMore, oldestCursor };
  }, [conversationId, hasMore, oldestCursor]);

  const isStreaming = status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;
  const activeContext = useActiveContext(messages);

  const handleAttachFiles = useCallback(
    (files: File[]): void => {
      if (files.length === 0) return;
      setAttachments((prev) => {
        const remainingSlots = MAX_ATTACHMENTS_PER_TURN - prev.length;
        if (remainingSlots <= 0) {
          toast.error(t('attachErrorTooMany'));
          return prev;
        }
        const accepted = files.slice(0, remainingSlots);
        if (accepted.length < files.length) {
          toast.error(t('attachErrorTooMany'));
        }
        const currentBytes = prev.reduce((s, a) => s + a.file.size, 0);
        const addedBytes = accepted.reduce((s, f) => s + f.size, 0);
        if (currentBytes + addedBytes > MAX_ATTACHMENTS_BYTES_PER_TURN) {
          toast.error(t('attachErrorTooLarge'));
          return prev;
        }
        const drafts: AttachmentDraft[] = accepted.map((file) => ({
          localId: uuidv7(),
          file,
        }));
        return [...prev, ...drafts];
      });
    },
    [t],
  );

  const handleRemoveAttachment = useCallback((localId: string): void => {
    setAttachments((prev) => prev.filter((a) => a.localId !== localId));
  }, []);

  const handleSend = (): void => {
    const trimmed = input.trim();
    if (!trimmed && attachments.length === 0) return;
    if (isStreaming || isSending) return;

    let cid = conversationId;
    if (!cid) {
      cid = uuidv7();
      setConversationId(cid);
    }

    const pending = attachments;
    const textToSend = trimmed;
    setInput('');
    setAttachments([]);

    const pageContext = parsePathnameToPageContext(pathname);

    if (pending.length === 0) {
      void sendMessage(
        { text: textToSend },
        { body: { conversationId: cid, pageContext } },
      );
      return;
    }

    setIsSending(true);
    void (async () => {
      try {
        const uploaded = await Promise.all(
          pending.map((a) => uploadAttachment(a.file)),
        );
        const fileParts: FileUIPart[] = uploaded.map((u) => ({
          type: 'file' as const,
          mediaType: u.mimeType,
          url: u.signedUrl,
          filename: u.originalName,
          providerMetadata: {
            [CHAT_PROVIDER_METADATA_KEY]: { fileId: u.fileId },
          },
        }));
        await sendMessage(
          { text: textToSend, files: fileParts },
          { body: { conversationId: cid, pageContext } },
        );
      } catch (e) {
        const code = e instanceof UploadAttachmentError ? e.code : 'unknown';
        if (code === 'size') toast.error(t('attachErrorTooLarge'));
        else toast.error(t('attachErrorUploadFailed'));
        setInput(textToSend);
        setAttachments(pending);
      } finally {
        setIsSending(false);
      }
    })();
  };

  const handleNewChat = async (): Promise<void> => {
    if (isStreaming) return;
    setConversationId(null);
    setMessages([]);
    setHasMore(false);
    setOldestCursor(null);
    setInput('');
    setAttachments([]);
    await clearActiveConversation();
  };

  const handleSelectConversation = async (id: string): Promise<void> => {
    if (isStreaming || id === conversationId) return;
    const result = await activateConversation(id);
    if (!result.ok) {
      toast.error(tErrors('description'));
      return;
    }
    setConversationId(result.data.conversationId);
    setMessages(result.data.messages);
    setHasMore(result.data.hasMore);
    setOldestCursor(result.data.oldestCursor);
    setInput('');
    setAttachments([]);
  };

  const handleConversationDeleted = (id: string): void => {
    if (id !== conversationId) return;
    setConversationId(null);
    setMessages([]);
    setHasMore(false);
    setOldestCursor(null);
    setInput('');
    setAttachments([]);
  };

  const handleLoadOlder = useCallback(async (): Promise<void> => {
    if (fetchingRef.current) return;
    const snapshot = loadOlderSnapshotRef.current;
    if (
      !snapshot.hasMore ||
      !snapshot.oldestCursor ||
      !snapshot.conversationId
    ) {
      return;
    }

    fetchingRef.current = true;
    setIsFetchingMore(true);

    const result = await fetchOlderMessages({
      threadId: snapshot.conversationId,
      before: snapshot.oldestCursor,
    });

    if (!result.ok) {
      fetchingRef.current = false;
      setIsFetchingMore(false);
      toast.error(tErrors('description'));
      return;
    }

    if (
      loadOlderSnapshotRef.current.conversationId !== snapshot.conversationId
    ) {
      fetchingRef.current = false;
      setIsFetchingMore(false);
      return;
    }

    setMessages((prev) => prependUnique(prev, result.data.messages));
    setHasMore(result.data.hasMore);
    setOldestCursor(result.data.oldestCursor);
    loadOlderSnapshotRef.current = {
      conversationId: snapshot.conversationId,
      hasMore: result.data.hasMore,
      oldestCursor: result.data.oldestCursor,
    };
    fetchingRef.current = false;
    setIsFetchingMore(false);
  }, [setMessages, tErrors]);

  const { scrollContainerRef, isAtBottom, scrollToBottom } = useChatScroll({
    conversationId,
    messages,
    hasMore,
    isFetchingMore,
    onLoadOlder: handleLoadOlder,
  });

  useEffect(() => {
    if (error) toast.error(tErrors('description'));
  }, [error, tErrors]);

  return (
    <FilesDropZone
      onDropFiles={handleAttachFiles}
      disabled={isStreaming}
      overlayLabel={t('dropToAttach')}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="flex shrink-0 items-center justify-end gap-0.5 px-2 pt-2">
        <ChatHistoryPopover
          activeConversationId={conversationId}
          onSelect={handleSelectConversation}
          onConversationDeleted={handleConversationDeleted}
          disabled={isStreaming}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleNewChat}
          disabled={isStreaming || !hasMessages}
          aria-label={t('newChat')}
          title={t('newChat')}
        >
          <PencilLine className="size-3.5" />
        </Button>
      </div>
      <div
        ref={scrollContainerRef}
        className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
      >
        {hasMessages ? (
          <MessagesList
            messages={messages}
            isStreaming={isStreaming}
            hasMore={hasMore}
            isFetchingMore={isFetchingMore}
          />
        ) : (
          <div className="@container flex flex-1 flex-col items-center justify-center">
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="mb-6 flex max-w-lg flex-col items-center space-y-2 text-center"
              >
                <h2 className="text-base font-semibold tracking-tight @2xl:text-lg">
                  {t('welcomeTitle')}
                </h2>
                <p className="text-[13px] text-muted-foreground @2xl:text-sm">
                  {t('welcomeSubtitle')}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
      <div className="relative shrink-0">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-8 right-0 left-0 h-8 bg-gradient-to-t from-background to-transparent"
        />
        {hasMessages && !isAtBottom && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={scrollToBottom}
            aria-label={t('scrollToBottom')}
            title={t('scrollToBottom')}
            className="absolute -top-11 left-1/2 z-10 size-8 -translate-x-1/2 rounded-full shadow-md ring-1 ring-stone/60"
          >
            <ArrowDown className="size-3.5" />
          </Button>
        )}
        <div className="flex justify-center bg-background pb-2">
          <motion.div
            initial={hasMessages ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
            className="flex w-full max-w-5xl flex-col items-center gap-3 px-4"
          >
            <div className="w-full max-w-5xl">
              <AttachmentTray
                attachments={attachments}
                onRemove={handleRemoveAttachment}
                disabled={isSending}
              />
              <FloatingInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                onStop={stop}
                onAttachFiles={handleAttachFiles}
                disabled={isStreaming || isSending}
                isWaiting={isSending}
                isStreaming={isStreaming}
                autoFocus={!hasMessages}
                activeContext={activeContext}
              />
            </div>
          </motion.div>
        </div>
      </div>
    </FilesDropZone>
  );
}
