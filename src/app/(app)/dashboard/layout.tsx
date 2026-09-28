import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DashboardHeaderBridgeProvider } from './components/dashboard-header-bridge-context';

export default function DashboardLayout({
  children,
  header,
}: {
  children: ReactNode;
  header: ReactNode;
}): React.ReactElement {
  return (
    <DashboardHeaderBridgeProvider>
      <TooltipProvider delay={0}>
        <main className="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-linen">
          <div className="w-full shrink-0">{header}</div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </main>
      </TooltipProvider>
    </DashboardHeaderBridgeProvider>
  );
}
