'use client';

import type { UIMessage } from 'ai';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type { MessageCursor } from '@/application/conversation/ports/message-store.port';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChatView } from './chat-view';
import {
  MAX_DASHBOARD_CHAT_PANEL_WIDTH_PX,
  useDashboardChatPanel,
} from './dashboard-chat-panel-context';

type Props = {
  initialConversationId: string | null;
  initialMessages: UIMessage[];
  initialHasMore: boolean;
  initialOldestCursor: MessageCursor | null;
};

function isDashboardHomePath(pathname: string): boolean {
  return /^\/dashboard\/?$/.test(pathname);
}

const TRANSITION =
  'transition-[flex-grow,flex-basis,padding] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]';

export function DashboardChatPanelColumn({
  initialConversationId,
  initialMessages,
  initialHasMore,
  initialOldestCursor,
}: Props) {
  const { isOpen, panelWidthPx, setPanelWidthPx } = useDashboardChatPanel();
  const pathname = usePathname();
  const t = useTranslations('Chat');
  const [isResizing, setIsResizing] = useState(false);

  const isExpanded = isDashboardHomePath(pathname);
  const basisPx = isExpanded ? 0 : isOpen ? panelWidthPx : 0;
  const grow = isExpanded ? 1 : 0;

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      setIsResizing(true);
      const startX = e.clientX;
      const startW = panelWidthPx;

      const move = (ev: PointerEvent): void => {
        const dynamicMax = Math.min(
          MAX_DASHBOARD_CHAT_PANEL_WIDTH_PX,
          window.innerWidth - 48,
        );
        const raw = startW + (startX - ev.clientX);
        setPanelWidthPx(Math.min(raw, dynamicMax));
      };

      const up = (ev: PointerEvent): void => {
        if (ev.pointerId !== e.pointerId) return;
        try {
          target.releasePointerCapture(ev.pointerId);
        } catch {}
        setIsResizing(false);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [panelWidthPx, setPanelWidthPx],
  );

  return (
    <div
      style={{
        flexGrow: grow,
        flexBasis: `${basisPx}px`,
      }}
      className={cn(
        'relative min-w-0 shrink-0 overflow-hidden bg-background',
        !isResizing && TRANSITION,
      )}
    >
      {!isExpanded && isOpen && (
        <Button
          type="button"
          variant="ghost"
          aria-label={t('resizePanel')}
          className={cn(
            'absolute top-0 left-0 z-10 h-full w-2 -translate-x-1/2 rounded-none',
            'cursor-col-resize touch-none border-0 bg-transparent p-0 select-none hover:bg-transparent',
            'after:absolute after:inset-y-6 after:left-1/2 after:w-px after:rounded-full after:bg-transparent after:transition-colors',
            'hover:after:bg-stone active:after:bg-charcoal',
          )}
          onPointerDown={onResizePointerDown}
        />
      )}
      <div
        className={cn(
          'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden pt-2 pr-2 pb-2',
          isExpanded && 'pl-2',
          TRANSITION,
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-transparent">
          <ChatView
            initialConversationId={initialConversationId}
            initialMessages={initialMessages}
            initialHasMore={initialHasMore}
            initialOldestCursor={initialOldestCursor}
          />
        </div>
      </div>
    </div>
  );
}
