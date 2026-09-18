'use client';

import { MessageSquare } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useDashboardChatPanel } from './chat/dashboard-chat-panel-context';

export function ChatToggleButton() {
  const pathname = usePathname();
  const { isOpen, toggle } = useDashboardChatPanel();
  const tChat = useTranslations('Chat');
  if (/^\/dashboard\/?$/.test(pathname)) return null;
  return (
    <Button
      type="button"
      variant={isOpen ? 'secondary' : 'ghost'}
      size="icon-sm"
      data-help-id="header.chat-toggle"
      onClick={toggle}
      aria-label={tChat('toggle')}
    >
      <MessageSquare className="size-3.5" />
    </Button>
  );
}
