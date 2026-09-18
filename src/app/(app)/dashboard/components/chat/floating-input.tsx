'use client';

import { Paperclip } from 'lucide-react';
import { useTranslations } from 'next-intl';
import posthog from 'posthog-js';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { toast } from 'sonner';
import { ALLOWED_MIME_TYPES } from '@/application/storage/dto';
import { Button } from '@/components/ui/button';
import type { ActiveContextRef } from '@/core/chat/active-context';
import { cn } from '@/lib/utils';
import { ChatContextChip } from './chat-context-chip';
import { SendActionButton } from './send-action-button';
import { useVoiceInput } from './use-voice-input';

const MAX_MESSAGE_LENGTH = 20_000;
const TEXTAREA_MAX_HEIGHT_PX = 192;
const ACCEPT_FILES = ALLOWED_MIME_TYPES.join(',');

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onAttachFiles?: (files: File[]) => void;
  disabled?: boolean;
  isWaiting?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  activeContext?: ActiveContextRef | null;
};

export function FloatingInput({
  value,
  onChange,
  onSend,
  onStop,
  onAttachFiles,
  disabled = false,
  isWaiting = false,
  isStreaming = false,
  placeholder,
  autoFocus = false,
  className,
  activeContext = null,
}: Props) {
  const t = useTranslations('Home');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSendAfterVoiceRef = useRef(false);

  const handleSend = useCallback(() => {
    posthog.capture('chat_message_sent', { message_length: value.length });
    onSend();
    textareaRef.current?.focus();
  }, [onSend, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && value.trim().length > 0) handleSend();
      }
    },
    [value, handleSend, disabled],
  );

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      onAttachFiles?.(Array.from(files));
      e.target.value = '';
    },
    [onAttachFiles],
  );

  const voice = useVoiceInput({
    onText: (text) => {
      const next =
        value.length > 0 && !value.endsWith(' ')
          ? `${value} ${text}`
          : `${value}${text}`;
      autoSendAfterVoiceRef.current = true;
      onChange(next);
    },
    onError: (msg) => {
      autoSendAfterVoiceRef.current = false;
      toast.error(msg);
    },
  });

  const handleMicClick = useCallback(() => {
    if (voice.status === 'recording') {
      voice.stop();
    } else if (voice.status === 'idle' || voice.status === 'error') {
      void voice.start();
    }
  }, [voice]);

  useEffect(() => {
    if (
      autoSendAfterVoiceRef.current &&
      value.trim().length > 0 &&
      !disabled &&
      !isWaiting &&
      !isStreaming
    ) {
      autoSendAfterVoiceRef.current = false;
      handleSend();
    }
  }, [value, disabled, isWaiting, isStreaming, handleSend]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (value.length === 0) {
      el.style.height = '';
      el.style.overflowY = 'hidden';
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
    el.style.overflowY =
      el.scrollHeight > TEXTAREA_MAX_HEIGHT_PX ? 'auto' : 'hidden';
  }, [value]);

  return (
    <div
      className={cn(
        'flex w-full max-w-5xl flex-col gap-2 rounded-2xl bg-card/80 p-3 shadow-md backdrop-blur-md transition-all',
        className,
      )}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? t('placeholder')}
        rows={2}
        className={cn(
          'w-full resize-none border-0 bg-transparent text-sm shadow-none outline-none placeholder:text-muted-foreground',
          'max-h-48 min-h-[44px]',
          'focus:outline-none focus:ring-0 focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0',
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleAttachClick}
            disabled={disabled || !onAttachFiles}
            aria-label={t('attach')}
            title={t('attach')}
          >
            <Paperclip className="size-3.5" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_FILES}
            hidden
            aria-hidden
            onChange={handleFileInputChange}
          />
          <ChatContextChip context={activeContext} />
        </div>
        <SendActionButton
          valueLength={value.length}
          maxLength={MAX_MESSAGE_LENGTH}
          hasContent={value.trim().length > 0 && !disabled}
          isWaiting={isWaiting}
          isStreaming={isStreaming}
          onSend={handleSend}
          onStop={onStop}
          micState={voice.isSupported ? voice.status : undefined}
          onMicClick={voice.isSupported ? handleMicClick : undefined}
        />
      </div>
    </div>
  );
}
