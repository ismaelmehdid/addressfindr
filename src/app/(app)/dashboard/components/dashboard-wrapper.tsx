'use client';

import type { ReactNode } from 'react';
import type { AuthenticatedUser } from '@/application/me/get-current-user';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DashboardHeaderBridgeProvider } from './dashboard-header-bridge-context';
import { DashboardSidebar } from './dashboard-sidebar';

function noop(): void {}

export function DashboardWrapper({
  user,
  children,
}: {
  user: AuthenticatedUser | null;
  children: ReactNode;
}) {
  return (
    <DashboardHeaderBridgeProvider>
      <TooltipProvider delay={0}>
        <SidebarProvider
          open={false}
          onOpenChange={noop}
          className="h-svh overflow-hidden"
          style={{ '--sidebar-width-icon': '2.5rem' } as React.CSSProperties}
        >
          <DashboardSidebar user={user} />
          <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-linen md:peer-data-[variant=inset]:my-4 md:peer-data-[variant=inset]:ml-0">
            {children}
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </DashboardHeaderBridgeProvider>
  );
}
