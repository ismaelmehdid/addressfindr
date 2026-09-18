import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { getAppEntitlement } from '@/application/billing/get-app-entitlement';
import { getCurrentUser } from '@/application/me/get-current-user';
import { DashboardMainShell } from './components/dashboard-main-shell';
import { DashboardWrapper } from './components/dashboard-wrapper';
import { ToastFromSearchParams } from './components/toast-from-search-params';

export default async function DashboardLayout({
  children,
  header,
}: {
  children: ReactNode;
  header: ReactNode;
}): Promise<React.ReactElement> {
  const currentUser = await getCurrentUser();
  if (currentUser.isErr()) redirect('/sign-in');
  if (!currentUser.value.organizationId) redirect('/onboarding');

  const entitlement = await getAppEntitlement();
  if (entitlement.isErr() || !entitlement.value.allowed) redirect('/paywall');

  return (
    <DashboardWrapper user={currentUser.value}>
      <Suspense fallback={null}>
        <ToastFromSearchParams />
      </Suspense>
      <DashboardMainShell header={header}>{children}</DashboardMainShell>
    </DashboardWrapper>
  );
}
