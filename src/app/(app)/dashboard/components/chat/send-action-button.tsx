'use client';

import { ArrowUp, Loader2, Mic, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type MicState =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'transcribing'
  | 'error';

type Props = {
  valueLength: number;
  maxLength: number;
  hasContent: boolean;
  isWaiting?: boolean;
  isStreaming?: boolean;
  onSend: () => void;
  onStop?: () => void;
  micState?: MicState;
  onMicClick?: () => void;
};

type ButtonConfig = {
  icon: ReactNode;
  variant: 'default' | 'destructive';
  onClick: () => void;
  disabled: boolean;
  label: string;
};

const noop = (): void => {};

export function SendActionButton({
  valueLength,
  maxLength,
  hasContent,
  isWaiting = false,
  isStreaming = false,
  onSend,
  onStop,
  micState,
  onMicClick,
}: Props) {
  const t = useTranslations('Chat');
  const isAtLimit = valueLength >= maxLength;
  const showCounter = valueLength >= maxLength * 0.8;

  const stopMode = isStreaming && !isWaiting && Boolean(onStop);
  const micActive =
    micState === 'requesting' ||
    micState === 'recording' ||
    micState === 'transcribing';
  const micMode =
    !stopMode &&
    !isWaiting &&
    Boolean(onMicClick) &&
    (micActive ||
      (!hasContent && (micState === 'idle' || micState === 'error')));

  const config = ((): ButtonConfig => {
    if (isWaiting) {
      return {
        icon: <Loader2 className="size-3.5 animate-spin" />,
        variant: 'default',
        onClick: noop,
        disabled: true,
        label: t('send'),
      };
    }
    if (stopMode && onStop) {
      return {
        icon: <Square className="size-3 fill-current" />,
        variant: 'destructive',
        onClick: onStop,
        disabled: false,
        label: t('stop'),
      };
    }
    if (micMode && onMicClick) {
      if (micState === 'transcribing') {
        return {
          icon: <Loader2 className="size-3.5 animate-spin" />,
          variant: 'default',
          onClick: noop,
          disabled: true,
          label: t('transcribing'),
        };
      }
      if (micState === 'recording') {
        return {
          icon: <Square className="size-3 fill-current" />,
          variant: 'destructive',
          onClick: onMicClick,
          disabled: false,
          label: t('stopRecording'),
        };
      }
      return {
        icon: <Mic className="size-3.5" />,
        variant: 'default',
        onClick: onMicClick,
        disabled: micState === 'requesting',
        label: t('mic'),
      };
    }
    return {
      icon: <ArrowUp className="size-3.5" />,
      variant: 'default',
      onClick: onSend,
      disabled: !hasContent || isAtLimit,
      label: t('send'),
    };
  })();

  return (
    <div className="flex flex-shrink-0 items-center gap-2">
      {showCounter && (
        <span
          className={cn(
            'text-xs tabular-nums',
            isAtLimit ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {valueLength.toLocaleString()}/{maxLength.toLocaleString()}
        </span>
      )}
      <Button
        type="button"
        size="icon-sm"
        variant={config.variant}
        onClick={config.onClick}
        disabled={config.disabled}
        aria-label={config.label}
        title={config.label}
      >
        {config.icon}
      </Button>
    </div>
  );
}
