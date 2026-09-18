'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { AuthenticatedUser } from '@/application/me/get-current-user';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ChatProvider } from './chat/chat-context';
import {
  DashboardChatPanelProvider,
  useDashboardChatPanel,
} from './chat/dashboard-chat-panel-context';
import { DashboardHeaderBridgeProvider } from './dashboard-header-bridge-context';
import { DashboardSidebar } from './dashboard-sidebar';

function noop(): void {}

function isDashboardHomePath(pathname: string): boolean {
  return /^\/dashboard\/?$/.test(pathname);
}

function ChatAwareInset({ children }: { children: ReactNode }) {
  const { isOpen } = useDashboardChatPanel();
  const pathname = usePathname();
  const isDashboardHome = isDashboardHomePath(pathname);
  return (
    <SidebarInset
      style={{ flexGrow: isDashboardHome ? 0 : 1 }}
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden bg-linen',
        'transition-[flex-grow,opacity,margin] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
        'md:peer-data-[variant=inset]:ml-0',
        isDashboardHome
          ? 'pointer-events-none opacity-0 md:peer-data-[variant=inset]:my-0 md:peer-data-[variant=inset]:mr-0'
          : 'opacity-100 md:peer-data-[variant=inset]:my-4',
        !isOpen && !isDashboardHome && 'md:peer-data-[variant=inset]:mr-2',
      )}
    >
      {children}
    </SidebarInset>
  );
}

export function DashboardWrapper({
  user,
  chat,
  children,
}: {
  user: AuthenticatedUser;
  chat: ReactNode;
  children: ReactNode;
}) {
  return (
    <DashboardChatPanelProvider>
      <ChatProvider>
        <DashboardHeaderBridgeProvider>
          <TooltipProvider delay={0}>
            <SidebarProvider
              open={false}
              onOpenChange={noop}
              className="h-svh overflow-hidden"
              style={
                { '--sidebar-width-icon': '2.5rem' } as React.CSSProperties
              }
            >
              <DashboardSidebar user={user} />
              <ChatAwareInset>{children}</ChatAwareInset>
              {chat}
            </SidebarProvider>
          </TooltipProvider>
        </DashboardHeaderBridgeProvider>
      </ChatProvider>
    </DashboardChatPanelProvider>
  );
}
