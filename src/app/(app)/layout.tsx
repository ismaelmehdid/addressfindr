import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/application/me/get-current-user';

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<React.ReactElement> {
  const currentUser = await getCurrentUser();
  if (currentUser.isErr()) redirect('/sign-in');
  return <>{children}</>;
}
