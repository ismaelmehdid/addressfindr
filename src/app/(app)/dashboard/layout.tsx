import type { ReactNode } from 'react';
import { getCurrentUser } from '@/application/me/get-current-user';
import { DashboardMainShell } from './components/dashboard-main-shell';
import { DashboardWrapper } from './components/dashboard-wrapper';

export default async function DashboardLayout({
  children,
  header,
}: {
  children: ReactNode;
  header: ReactNode;
}): Promise<React.ReactElement> {
  const currentUser = await getCurrentUser();
  const user = currentUser.isOk() ? currentUser.value : null;

  return (
    <DashboardWrapper user={user}>
      <DashboardMainShell header={header}>{children}</DashboardMainShell>
    </DashboardWrapper>
  );
}
